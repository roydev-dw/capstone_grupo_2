import json
from decimal import Decimal, InvalidOperation
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.core.paginator import Paginator
from django.conf import settings
from core.models import Producto, Categoria, Sucursal, Empresa, Usuario
from core.passwords import check_password  # Argon2
from core.jwt_utils import make_access_token, make_refresh_token, decode_token
from core.auth_decorators import require_jwt
from django.db import IntegrityError


def _set_token_cookies(resp: JsonResponse, access: str | None, refresh: str | None):
    """Setea cookies httpOnly para web. (Opcional: además devolvemos en JSON)."""
    flags = {
        "httponly": True,
        "secure": True,               # True porque ya tienes HTTPS con Nginx
        "samesite": "Strict",
        "path": "/",
    }
    if access is not None:
        resp.set_cookie(
            "access_token",
            access,
            max_age=int(settings.JWT_ACCESS_TTL.total_seconds()),
            **flags
        )
    if refresh is not None:
        resp.set_cookie(
            "refresh_token",
            refresh,
            max_age=int(settings.JWT_REFRESH_TTL.total_seconds()),
            **flags
        )
    return resp


def _clear_token_cookies(resp: JsonResponse):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")
    return resp


@csrf_exempt
def login_api(request):
    if request.method != 'POST':
        return JsonResponse({"detail": "Método no permitido. Usa POST."}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({"detail": "JSON inválido."}, status=400)

    email = (payload.get('email') or '').strip().lower()
    password = payload.get('password') or ''
    if not email or not password:
        return JsonResponse({"detail": "email y password son requeridos."}, status=400)

    try:
        user = Usuario.objects.get(email=email)
    except Usuario.DoesNotExist:
        return JsonResponse({"detail": "Credenciales inválidas."}, status=401)

    # ✅ Validación segura con Argon2 (sin texto plano)
    if not check_password(password, user.contrasena_hash):
        return JsonResponse({"detail": "Credenciales inválidas."}, status=401)

    if not user.estado:
        return JsonResponse({"detail": "Usuario inactivo."}, status=403)

    # Emisión de tokens según tus TTL (ACCESS=5h, REFRESH=7d)
    access = make_access_token(user)
    refresh = make_refresh_token(user)

    # Devolvemos en JSON (útil para Postman/SPA) y setemos cookies httpOnly (web)
    resp = JsonResponse({
        "ok": True,
        "access": access,
        "refresh": refresh,
        "user": {
            "usuario_id": user.usuario_id,
            "nombre": user.nombre_completo,
            "email": user.email,
            "rol": user.rol.nombre if user.rol_id else None,
            "empresa_id": user.empresa_id,
            "sucursal_id": user.sucursal_id,
        }
    }, status=200)
    _set_token_cookies(resp, access, refresh)
    return resp


@csrf_exempt
def refresh_api(request):
    if request.method != 'POST':
        return JsonResponse({"detail": "Método no permitido. Usa POST."}, status=405)

    # 1) Intentamos leer el refresh desde cookie httpOnly; si no, desde el body.
    token = request.COOKIES.get("refresh_token")
    if not token:
        try:
            data = json.loads(request.body.decode('utf-8'))
            token = data.get("refresh")
        except Exception:
            token = None
    if not token:
        return JsonResponse({"detail": "Falta token refresh."}, status=400)

    # 2) Validar token y tipo
    try:
        data = decode_token(token)
    except Exception:
        return JsonResponse({"detail": "Token inválido."}, status=401)

    if data.get("type") != "refresh":
        return JsonResponse({"detail": "Token refresh inválido."}, status=401)

    # 3) Buscar usuario
    try:
        user = Usuario.objects.get(pk=data.get("sub"))
    except Usuario.DoesNotExist:
        return JsonResponse({"detail": "Usuario no existe."}, status=401)

    if not user.estado:
        return JsonResponse({"detail": "Usuario inactivo."}, status=403)

    # 4) Rotación simple: emitimos un nuevo access y un nuevo refresh (no persistimos nada)
    new_access = make_access_token(user)
    new_refresh = make_refresh_token(user)

    resp = JsonResponse({"ok": True, "access": new_access, "refresh": new_refresh}, status=200)
    _set_token_cookies(resp, new_access, new_refresh)
    return resp


@csrf_exempt
def logout_api(request):
    """
    Sin persistencia de refresh en BD, 'revocar' real no es posible (stateless).
    Este logout limpia cookies en el cliente; los tokens existentes expiran por tiempo.
    """
    resp = JsonResponse({"ok": True, "detail": "Sesión cerrada"})
    _clear_token_cookies(resp)
    return resp


@require_jwt
def me_api(request):
    u = request.user_obj
    return JsonResponse({
        "ok": True,
        "user": {
            "usuario_id": u.usuario_id,
            "nombre": u.nombre_completo,
            "email": u.email,
            "rol": u.rol.nombre if u.rol_id else None,
            "empresa_id": u.empresa_id,
            "sucursal_id": u.sucursal_id,
        },
        "claims": request.jwt_payload,
    })


def _producto_to_dict(p: Producto):
    return {
        "producto_id": p.producto_id,
        "categoria_id": p.categoria_id,
        "categoria_nombre": p.categoria.nombre if p.categoria_id else None,
        "nombre": p.nombre,
        "descripcion": p.descripcion,
        # Serializamos Decimal a str para evitar issues en JSON:
        "precio_base": str(p.precio_base),
        "tiempo_preparacion": p.tiempo_preparacion,
        "estado": p.estado,
        "fecha_creacion": p.fecha_creacion.isoformat() if p.fecha_creacion else None,
    }


def _parse_decimal(value, field_name):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"'{field_name}' debe ser decimal válido.")


def _parse_int(value, field_name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{field_name}' debe ser entero válido.")


@csrf_exempt
@require_jwt
def productos_list(request):
    """
    GET: lista con filtros y paginación
      - q (búsqueda por nombre/descripcion)
      - categoria_id
      - estado (true/false)
      - ordering (nombre,-precio_base, etc)
      - page, page_size
    POST: crea producto
    """
    if request.method == "GET":
        qs = Producto.objects.select_related("categoria").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(descripcion__icontains=q))

        categoria_id = request.GET.get("categoria_id")
        if categoria_id:
            qs = qs.filter(categoria_id=categoria_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            # ejemplo: nombre  | -precio_base | fecha_creacion
            qs = qs.order_by(ordering)

        # Paginación simple
        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_producto_to_dict(p) for p in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        })

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        # Validaciones mínimas
        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        # ✅ categoria es OPCIONAL
        cat = None
        categoria_id = payload.get("categoria_id")
        if categoria_id:
            try:
                cat = Categoria.objects.get(pk=categoria_id)
            except Categoria.DoesNotExist:
                return JsonResponse({"detail": "Categoria no existe."}, status=404)

        try:
            precio_base = _parse_decimal(payload.get("precio_base"), "precio_base")
        except ValueError as e:
            return JsonResponse({"detail": str(e)}, status=400)

        try:
            tiempo_preparacion = _parse_int(payload.get("tiempo_preparacion"), "tiempo_preparacion")
        except ValueError as e:
            return JsonResponse({"detail": str(e)}, status=400)

        descripcion = payload.get("descripcion") or None
        estado = payload.get("estado")
        estado_val = estado if isinstance(estado, bool) else True

        p = Producto.objects.create(
            categoria=cat,                 # <-- puede ser None
            nombre=nombre,
            descripcion=descripcion,
            precio_base=precio_base,
            tiempo_preparacion=tiempo_preparacion,
            estado=estado_val,
        )
        return JsonResponse({"ok": True, "producto": _producto_to_dict(p)}, status=201)
        return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
def producto_detail(request, producto_id: int):
    """
    GET: detalle
    PUT/PATCH: actualización
    DELETE: baja lógica (estado=False) por defecto; hard delete con ?hard=1
    """
    try:
        p = Producto.objects.select_related("categoria").get(pk=producto_id)
    except Producto.DoesNotExist:
        return JsonResponse({"detail": "Producto no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "producto": _producto_to_dict(p)})

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        # Campos opcionales (solo actualiza si vienen)
        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            p.nombre = nombre

        if "descripcion" in payload:
            p.descripcion = payload.get("descripcion") or None

        if "categoria_id" in payload:
            cid = payload.get("categoria_id")
            if cid is None or cid == "":
                p.categoria = None
            else:
                try:
                    cat = Categoria.objects.get(pk=cid)
                except Categoria.DoesNotExist:
                    return JsonResponse({"detail": "Categoria no existe."}, status=404)
            p.categoria = cat

        if "precio_base" in payload:
            try:
                p.precio_base = _parse_decimal(payload.get("precio_base"), "precio_base")
            except ValueError as e:
                return JsonResponse({"detail": str(e)}, status=400)

        if "tiempo_preparacion" in payload:
            try:
                p.tiempo_preparacion = _parse_int(payload.get("tiempo_preparacion"), "tiempo_preparacion")
            except ValueError as e:
                return JsonResponse({"detail": str(e)}, status=400)

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                p.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        p.save()
        return JsonResponse({"ok": True, "producto": _producto_to_dict(p)})

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            p.delete()
            return JsonResponse({"ok": True, "detail": "Producto eliminado."})
        # baja lógica
        p.estado = False
        p.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Producto deshabilitado."})
    
    return JsonResponse({"detail": "Método no permitido."}, status=405)


def _sucursal_to_dict(s: Sucursal):
    return {
        "sucursal_id": s.sucursal_id,
        "empresa_id": s.empresa_id,
        "empresa_nombre": s.empresa.nombre if s.empresa_id else None,
        "nombre": s.nombre,
        "direccion": s.direccion,
        "telefono": s.telefono,
        "estado": s.estado,
        "fecha_creacion": s.fecha_creacion.isoformat() if s.fecha_creacion else None,
    }

@csrf_exempt
@require_jwt
def sucursales_list(request):
    """
    GET: lista de sucursales con filtros/paginación
      - q (busca por nombre/dirección/teléfono)
      - empresa_id
      - estado (true/false)
      - ordering (nombre, -fecha_creacion, etc)
      - page, page_size
    POST: crea sucursal
      Campos:
        - nombre (requerido)
        - direccion (opcional)
        - telefono (opcional)
        - estado (bool, default True)
        - empresa_id (según tu modelo: requerido u opcional)
    """
    if request.method == "GET":
        qs = Sucursal.objects.select_related("empresa").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(
                Q(nombre__icontains=q) |
                Q(direccion__icontains=q) |
                Q(telefono__icontains=q)
            )

        empresa_id = request.GET.get("empresa_id")
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_sucursal_to_dict(s) for s in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        # empresa_id según tu modelo:
        empresa = None
        empresa_id = payload.get("empresa_id")
        if empresa_id:
            try:
                empresa = Empresa.objects.get(pk=empresa_id)
            except Empresa.DoesNotExist:
                return JsonResponse({"detail": "Empresa no existe."}, status=404)
        # Si tu modelo NO permite null, y no mandan empresa_id:
        # descomenta el siguiente bloque para forzar requerimiento:
        # else:
        #     return JsonResponse({"detail": "'empresa_id' es requerido."}, status=400)

        s = Sucursal.objects.create(
            empresa=empresa,
            nombre=nombre,
            direccion=payload.get("direccion") or None,
            telefono=payload.get("telefono") or None,
            estado=payload.get("estado", True),
        )
        return JsonResponse({"ok": True, "sucursal": _sucursal_to_dict(s)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
def sucursal_detail(request, sucursal_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar campos (incluye empresa_id opcional)
    DELETE: soft delete (estado=False) por defecto; hard delete con ?hard=1
    """
    try:
        s = Sucursal.objects.select_related("empresa").get(pk=sucursal_id)
    except Sucursal.DoesNotExist:
        return JsonResponse({"detail": "Sucursal no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "sucursal": _sucursal_to_dict(s)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            s.nombre = nombre

        if "direccion" in payload:
            s.direccion = payload.get("direccion") or None

        if "telefono" in payload:
            s.telefono = payload.get("telefono") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                s.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        if "empresa_id" in payload:
            eid = payload.get("empresa_id")
            if eid in (None, "", "null"):
                s.empresa = None
            else:
                try:
                    emp = Empresa.objects.get(pk=eid)
                except Empresa.DoesNotExist:
                    return JsonResponse({"detail": "Empresa no existe."}, status=404)
                s.empresa = emp

        s.save()
        return JsonResponse({"ok": True, "sucursal": _sucursal_to_dict(s)}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            s.delete()
            return JsonResponse({"ok": True, "detail": "Sucursal eliminada (hard)."}, status=200)
        s.estado = False
        s.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Sucursal deshabilitada (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


def _empresa_to_dict(e: Empresa):
    return {
        "empresa_id": e.empresa_id,
        "nombre": e.nombre,
        "rut": e.rut,
        "direccion": e.direccion,
        "telefono": e.telefono,
        "email": e.email,
        "estado": e.estado,
        "fecha_creacion": e.fecha_creacion.isoformat() if e.fecha_creacion else None,
    }


@csrf_exempt
@require_jwt
def empresas_list(request):
    """
    GET: lista con filtros/paginación
      - q (busca en nombre/direccion/email/telefono/rut)
      - rut (match exacto)
      - estado (true/false)
      - ordering (nombre, -fecha_creacion, rut, etc.)
      - page, page_size
    POST: crea empresa
      Campos requeridos: nombre, rut, email
      Opcionales: direccion, telefono, estado (default True)
    """
    if request.method == "GET":
        qs = Empresa.objects.all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(
                Q(nombre__icontains=q) |
                Q(direccion__icontains=q) |
                Q(email__icontains=q) |
                Q(telefono__icontains=q) |
                Q(rut__icontains=q)
            )

        rut = request.GET.get("rut")
        if rut:
            qs = qs.filter(rut=rut)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_empresa_to_dict(e) for e in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        rut = (payload.get("rut") or "").strip()
        email = (payload.get("email") or "").strip()
        if not nombre or not rut or not email:
            return JsonResponse({"detail": "Campos requeridos: nombre, rut, email."}, status=400)

        try:
            e = Empresa.objects.create(
                nombre=nombre,
                rut=rut,
                email=email,
                direccion=payload.get("direccion") or None,
                telefono=payload.get("telefono") or None,
                estado=payload.get("estado", True),
            )
        except IntegrityError as ie:
            # p.ej. RUT o Email duplicado (según constraints)
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "empresa": _empresa_to_dict(e)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
def empresa_detail(request, empresa_id: int):
    """
    GET: detalle
    PUT/PATCH: actualización de campos
    DELETE:
      - soft delete: estado=False
      - hard delete: ?hard=1
    """
    try:
        e = Empresa.objects.get(pk=empresa_id)
    except Empresa.DoesNotExist:
        return JsonResponse({"detail": "Empresa no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "empresa": _empresa_to_dict(e)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            e.nombre = nombre

        if "rut" in payload:
            rut = (payload.get("rut") or "").strip()
            if not rut:
                return JsonResponse({"detail": "'rut' no puede ser vacío."}, status=400)
            e.rut = rut

        if "email" in payload:
            email = (payload.get("email") or "").strip()
            if not email:
                return JsonResponse({"detail": "'email' no puede ser vacío."}, status=400)
            e.email = email

        if "direccion" in payload:
            e.direccion = payload.get("direccion") or None

        if "telefono" in payload:
            e.telefono = payload.get("telefono") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                e.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        try:
            e.save()
        except IntegrityError as ie:
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "empresa": _empresa_to_dict(e)}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            # ⚠️ Si hay Sucursales dependientes y FK en CASCADE, esto las borrará.
            # Si tu modelo usa PROTECT/SET_NULL, actuará acorde.
            e.delete()
            return JsonResponse({"ok": True, "detail": "Empresa eliminada (hard)."}, status=200)

        # Soft delete
        e.estado = False
        e.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Empresa deshabilitada (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


def _categoria_to_dict(c: Categoria):
    return {
        "categoria_id": c.categoria_id,
        "sucursal_id": c.sucursal_id,
        "sucursal_nombre": c.sucursal.nombre if c.sucursal_id else None,
        "nombre": c.nombre,
        "descripcion": c.descripcion,
        "estado": c.estado,
        "fecha_creacion": c.fecha_creacion.isoformat() if c.fecha_creacion else None,
    }


@csrf_exempt
@require_jwt
def categorias_list(request):
    """
    GET: lista con filtros y paginación
      - q (busca por nombre/descripcion)
      - sucursal_id (filtra por sucursal)
      - estado (true/false)
      - ordering (nombre, -fecha_creacion, etc.)
      - page, page_size
    POST: crea categoría (REQUERIDOS: nombre, sucursal_id)
    """
    if request.method == "GET":
        qs = Categoria.objects.select_related("sucursal").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(descripcion__icontains=q))

        sucursal_id = request.GET.get("sucursal_id")
        if sucursal_id:
            qs = qs.filter(sucursal_id=sucursal_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_categoria_to_dict(c) for c in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        # Requeridos: nombre, sucursal_id
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        sucursal_id = payload.get("sucursal_id")
        if not sucursal_id:
            return JsonResponse({"detail": "'sucursal_id' es requerido."}, status=400)
        try:
            suc = Sucursal.objects.get(pk=sucursal_id)
        except Sucursal.DoesNotExist:
            return JsonResponse({"detail": "Sucursal no existe."}, status=404)

        c = Categoria.objects.create(
            sucursal=suc,
            nombre=nombre,
            descripcion=payload.get("descripcion") or None,
            estado=payload.get("estado", True),
        )
        return JsonResponse({"ok": True, "categoria": _categoria_to_dict(c)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
def categoria_detail(request, categoria_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar (se puede cambiar sucursal_id)
    DELETE: soft delete (estado=False) por defecto; hard delete con ?hard=1
    """
    try:
        c = Categoria.objects.select_related("sucursal").get(pk=categoria_id)
    except Categoria.DoesNotExist:
        return JsonResponse({"detail": "Categoría no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "categoria": _categoria_to_dict(c)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            c.nombre = nombre

        if "descripcion" in payload:
            c.descripcion = payload.get("descripcion") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                c.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        if "sucursal_id" in payload:
            sid = payload.get("sucursal_id")
            if not sid:
                return JsonResponse({"detail": "'sucursal_id' no puede ser vacío."}, status=400)
            try:
                suc = Sucursal.objects.get(pk=sid)
            except Sucursal.DoesNotExist:
                return JsonResponse({"detail": "Sucursal no existe."}, status=404)
            c.sucursal = suc

        c.save()
        return JsonResponse({"ok": True, "categoria": _categoria_to_dict(c)}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            c.delete()
            return JsonResponse({"ok": True, "detail": "Categoría eliminada (hard)."}, status=200)
        c.estado = False
        c.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Categoría deshabilitada (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)