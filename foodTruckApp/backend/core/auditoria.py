from functools import wraps
from django.http import JsonResponse
from django.urls import resolve
from core.models import (
    Auditoria,
    UsuarioSucursal,
    Sucursal,
    Producto,
    Pedido
)
import json


def registrar_auditoria(entidad):
    """
    Decorador para registrar auditoría para POST, PUT, PATCH, DELETE
    """

    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):

            # Ejecutamos la vista real primero
            response = view_func(request, *args, **kwargs)

            try:
                # =======================================================
                # 1) Obtener usuario autenticado del request
                # =======================================================
                usuario = getattr(request, "usuario", None)
                if usuario is None:
                    return response

                usuario_id = usuario.usuario_id

                # =======================================================
                # 2) Registrar SOLO métodos que modifican datos
                # =======================================================
                metodo = request.method.upper()
                if metodo not in ("POST", "PUT", "PATCH", "DELETE"):
                    return response

                # =======================================================
                # 3) Obtener endpoint (ruta solicitada)
                # =======================================================
                endpoint = request.path

                # =======================================================
                # 4) Intentar obtener sucursal desde UsuarioSucursal
                # =======================================================
                us = (
                    UsuarioSucursal.objects
                    .filter(usuario_id=usuario_id, estado=True)
                    .select_related("sucursal")
                    .first()
                )

                sucursal = us.sucursal if us else None

                # =======================================================
                # 5) Obtener ID de la entidad afectada (si aplica)
                # =======================================================
                entidad_id = None
                if "producto_id" in kwargs:
                    entidad_id = kwargs["producto_id"]
                if "pedido_id" in kwargs:
                    entidad_id = kwargs["pedido_id"]

                # =======================================================
                # 6) Obtener sucursal desde contexto de PRODUCTO
                # =======================================================
                if entidad == "Producto" and entidad_id:
                    try:
                        p = Producto.objects.select_related(
                            "categoria", "categoria__sucursal"
                        ).get(pk=entidad_id)
                        sucursal = sucursal or p.categoria.sucursal
                    except:
                        pass

                # =======================================================
                # 7) Obtener sucursal desde contexto de PEDIDO
                # =======================================================
                if entidad == "Pedido" and entidad_id:
                    try:
                        ped = Pedido.objects.select_related("sucursal").get(pk=entidad_id)
                        sucursal = sucursal or ped.sucursal
                    except:
                        pass

                # =======================================================
                # 8) Intentar obtener sucursal desde ?sucursal_id=
                # =======================================================
                if sucursal is None:
                    sid = request.GET.get("sucursal_id")
                    if sid:
                        try:
                            sucursal = Sucursal.objects.get(pk=sid)
                        except Sucursal.DoesNotExist:
                            pass

                # =======================================================
                # 9) Si NO se pudo determinar sucursal → NO registrar
                # =======================================================
                if sucursal is None:
                    print("⚠ Auditoría omitida: No se pudo determinar SucursalId.")
                    return response

                # =======================================================
                # 10) Obtener detalles de la operación
                # =======================================================
                detalles = None
                if metodo in ("POST", "PUT", "PATCH"):
                    try:
                        detalles = json.dumps(request.data)
                    except:
                        try:
                            detalles = request.body.decode("utf-8")
                        except:
                            detalles = str(request.body)

                # =======================================================
                # 11) IP del cliente
                # =======================================================
                ip = request.META.get("REMOTE_ADDR")

                # =======================================================
                # 12) Registrar AUDITORÍA
                # =======================================================
                Auditoria.objects.create(
                    usuario_id=usuario_id,
                    sucursal=sucursal,
                    accion=metodo,
                    entidad=entidad,
                    entidad_id=entidad_id,
                    detalles=f"Endpoint: {endpoint}\n{detalles or ''}",
                    ip=ip
                )

            except Exception as e:
                print("Error registrando auditoría:", e)

            return response

        return wrapper

    return decorator