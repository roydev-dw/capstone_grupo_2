import { useEffect, useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '../ui/Button';
import { usuariosRepo } from '../../utils/repoUsuarios';
import { sucursalesRepo } from '../../utils/repoSucursales';
import { rolesRepo } from '../../utils/roles';
import { userSchema } from '../validations/userValidation';
import { FaRegEye, FaRegEyeSlash } from 'react-icons/fa';
import { IoClose } from 'react-icons/io5';

export const PanelUsuarios = ({ empresaId, sucursalId, isAdmin = false, onClose }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDisabled, setShowDisabled] = useState(false);

  const [sucursales, setSucursales] = useState([]);
  const [roles, setRoles] = useState([]);

  const [form, setForm] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    empresa_id: empresaId ?? '',
    sucursal_id: sucursalId ?? '',
    sucursales_ids: [],
    rol_id: '',
    estado: true,
  });

  const [editId, setEditId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [openSucursales, setOpenSucursales] = useState(false); // dropdown de sucursales

  // ref para detectar click fuera del dropdown
  const dropdownRef = useRef(null);

  const cargarUsuarios = async () => {
    console.log('[PanelUsuarios] cargarUsuarios()', {
      empresaId,
      sucursalId,
      showDisabled,
    });

    if (!sucursalId) {
      console.log('[PanelUsuarios] No hay sucursalId, seteando usuarios = []');
      setUsuarios([]);
      return;
    }

    const filters = {};
    if (empresaId) filters.empresaId = empresaId;
    filters.sucursalId = sucursalId;

    console.log('[PanelUsuarios] Llamando usuariosRepo.list con filters:', filters);

    try {
      const items = await usuariosRepo.list(filters);
      console.log('[PanelUsuarios] usuariosRepo.list() result RAW:', items);

      (items || []).forEach((u) => {
        console.log('[PanelUsuarios] usuario:', {
          id: u.id,
          nombre: u.nombre_completo,
          sucursal_id: u.sucursal_id,
          sucursales_ids: u.sucursales_ids,
        });
      });

      const porSucursal = (items || []).filter((u) => {
        const sucursalPrincipal = u.sucursal_id ?? u.sucursalId ?? null;
        const sucursalesMultiples = u.sucursales_ids ?? u.sucursalesIds ?? [];

        const matchPrincipal = sucursalPrincipal != null && Number(sucursalPrincipal) === Number(sucursalId);

        const matchMultiples =
          Array.isArray(sucursalesMultiples) && sucursalesMultiples.some((sid) => Number(sid) === Number(sucursalId));

        return matchPrincipal || matchMultiples;
      });

      console.log('[PanelUsuarios] usuarios luego de filtrar por sucursal:', porSucursal);

      const filtrados = porSucursal
        .filter((u) => (showDisabled ? true : u.estado !== false))
        .filter((u) => Number(u.rol_id) !== 1);

      console.log('[PanelUsuarios] usuarios después de filtrar (sin admin / estado):', filtrados);

      setUsuarios(filtrados);
    } catch (err) {
      console.error('[PanelUsuarios] Error cargando usuarios:', err);
      setUsuarios([]);
      throw err;
    }
  };

  const cargarMetadatos = async () => {
    console.log('[PanelUsuarios] cargarMetadatos()', { empresaId });

    try {
      const [suc, r] = await Promise.all([sucursalesRepo.list({ empresaId }), rolesRepo.list()]);
      console.log('[PanelUsuarios] sucursales desde API:', suc);
      console.log('[PanelUsuarios] roles desde API:', r);

      setSucursales(suc);
      setRoles(r);
    } catch (err) {
      console.error('[PanelUsuarios] Error cargando metadatos:', err);
      throw err;
    }
  };

  useEffect(() => {
    console.log('[PanelUsuarios] useEffect inicial / deps cambiaron', {
      empresaId,
      sucursalId,
      showDisabled,
    });

    (async () => {
      setLoading(true);
      try {
        await Promise.all([cargarMetadatos(), cargarUsuarios()]);
      } catch (err) {
        setErrorMsg(err?.message ?? 'Error cargando usuarios');
      } finally {
        setLoading(false);
      }
    })();
  }, [showDisabled, empresaId, sucursalId]);

  const resetForm = () => {
    console.log('[PanelUsuarios] resetForm()');
    setEditId(null);
    setForm({
      nombre_completo: '',
      email: '',
      password: '',
      telefono: '',
      empresa_id: empresaId ?? '',
      sucursal_id: sucursalId == null ? '' : String(sucursalId),
      sucursales_ids: [],
      rol_id: '',
      estado: true,
    });
  };

  useEffect(() => {
    if (editId) return;
    const sucursalValue = sucursalId == null ? '' : String(sucursalId);
    console.log('[PanelUsuarios] sync form con empresaId/sucursalId', {
      empresaId,
      sucursalId,
      sucursalValue,
    });
    setForm((prev) => ({
      ...prev,
      empresa_id: empresaId ?? '',
      sucursal_id: sucursalValue,
      sucursales_ids: Array.isArray(prev.sucursales_ids) ? prev.sucursales_ids : [],
    }));
  }, [empresaId, sucursalId, editId]);

  // cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!openSucursales) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenSucursales(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openSucursales]);

  const submitUsuario = async (e) => {
    e.preventDefault();
    console.log('[PanelUsuarios] submitUsuario()', { form, empresaId, sucursalId });

    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');

    try {
      await userSchema.validate(form, { abortEarly: true });
    } catch (err) {
      const msg = err?.errors?.[0] || err?.message || 'Revisa los campos del formulario';
      setErrorMsg(String(msg));
      toast.error(msg);
      console.warn('[PanelUsuarios] Validación fallida:', err);
      return;
    }

    const nombre = form.nombre_completo.trim();
    setSaving(true);
    setErrorMsg('');

    const empresaFinal = Number(form.empresa_id || empresaId);

    const selectedSucursales = Array.isArray(form.sucursales_ids)
      ? form.sucursales_ids.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const sucursalPrincipal = selectedSucursales[0] ?? (form.sucursal_id ? Number(form.sucursal_id) : null);

    const sucursalesPayload = selectedSucursales.length
      ? selectedSucursales
      : sucursalPrincipal != null && Number.isFinite(sucursalPrincipal)
      ? [sucursalPrincipal]
      : [];

    console.log('[PanelUsuarios] Payload a enviar al backend:', {
      editId,
      empresaFinal,
      sucursalPrincipal,
      sucursalesPayload,
      rol_id: Number(form.rol_id),
    });

    try {
      if (editId) {
        await usuariosRepo.update(editId, {
          ...form,
          empresa_id: empresaFinal,
          sucursal_id: sucursalPrincipal,
          sucursales: sucursalesPayload,
          rol_id: Number(form.rol_id),
        });
        toast.success(`Usuario ${nombre} actualizado`);
      } else {
        await usuariosRepo.create({
          ...form,
          empresa_id: empresaFinal,
          sucursal_id: sucursalPrincipal,
          sucursales: sucursalesPayload,
          rol_id: Number(form.rol_id),
        });
        toast.success(`Usuario ${nombre} creado`);
      }
      resetForm();
      await cargarUsuarios();
    } catch (err) {
      const msg = err?.message || 'No se pudo guardar';
      setErrorMsg(String(msg));
      toast.error(msg);
      console.error('[PanelUsuarios] Error al crear/actualizar usuario:', err);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u) => {
    console.log('[PanelUsuarios] startEdit()', u);
    setEditId(u.id);

    const sucursalesArray = Array.isArray(u.sucursales_ids) ? u.sucursales_ids : [];

    const primeraSucursal = u.sucursal_id ?? (sucursalesArray.length ? sucursalesArray[0] : null) ?? sucursalId ?? '';

    setForm({
      nombre_completo: u.nombre_completo ?? '',
      email: u.email ?? '',
      password: '',
      telefono: u.telefono ?? '',
      empresa_id: u.empresa_id ?? empresaId ?? '',
      sucursal_id: primeraSucursal ?? '',
      sucursales_ids: sucursalesArray.length
        ? sucursalesArray.map((v) => String(v))
        : primeraSucursal != null
        ? [String(primeraSucursal)]
        : [],
      rol_id: u.rol_id ?? '',
      estado: u.estado ?? true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const habilitar = async (u) => {
    console.log('[PanelUsuarios] habilitar()', u);
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');
    setBusyId(u.id);
    try {
      await usuariosRepo.patch(u.id, { estado: true });
      await cargarUsuarios();
      toast.success('Usuario habilitado');
    } catch (err) {
      console.error('[PanelUsuarios] Error al habilitar usuario:', err);
      toast.error('No se pudo habilitar');
    } finally {
      setBusyId(null);
    }
  };

  const deshabilitar = async (u) => {
    console.log('[PanelUsuarios] deshabilitar()', u);
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');
    if (!confirm('Esto deshabilitará el usuario. ¿Continuar?')) return;
    setBusyId(u.id);
    try {
      await usuariosRepo.disable(u.id);
      await cargarUsuarios();
      toast.success('Usuario deshabilitado');
    } catch (err) {
      console.error('[PanelUsuarios] Error al deshabilitar usuario:', err);
      toast.error('No se pudo deshabilitar');
    } finally {
      setBusyId(null);
    }
  };

  const eliminar = async (u) => {
    console.log('[PanelUsuarios] eliminar()', u);
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');
    if (!confirm('Esto eliminará el usuario definitivamente. ¿Continuar?')) return;
    setBusyId(u.id);
    try {
      await usuariosRepo.destroy(u.id);
      await cargarUsuarios();
      toast.success('Usuario eliminado definitivamente');
    } catch (err) {
      console.error('[PanelUsuarios] Error al eliminar usuario:', err);
      toast.error('No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  const sucursalesFiltradas = sucursales;
  const rolesLimitados = roles.filter((r) => ['Supervisor', 'Vendedor'].includes((r.nombre || '').trim()));

  if (!sucursalId) {
    console.log('[PanelUsuarios] Render sin sucursalId, mostrando mensaje de selección');
    return (
      <section className='bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-gray-600'>
        <p className='text-lg font-semibold text-texto'>Selecciona un foodtruck</p>
        <p className='text-sm'>Elige una sucursal para administrar sus usuarios.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className='bg-white rounded-2xl shadow-sm border border-gray-100 p-6'>
        <p>Cargando usuarios…</p>
      </section>
    );
  }

  const toggleSucursalEnForm = (id) => {
    setForm((prev) => {
      const idStr = String(id);
      const current = Array.isArray(prev.sucursales_ids) ? prev.sucursales_ids : [];
      const exists = current.includes(idStr);
      const next = exists ? current.filter((v) => v !== idStr) : [...current, idStr];

      const nextSucursalPrincipal = prev.sucursal_id || (next.length ? next[0] : '');

      return {
        ...prev,
        sucursales_ids: next,
        sucursal_id: nextSucursalPrincipal,
      };
    });
  };

  const isSucursalChecked = (id) => Array.isArray(form.sucursales_ids) && form.sucursales_ids.includes(String(id));

  return (
    <section className='bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6'>
      <div className='flex items-center justify-between gap-4'>
        <h2 className='text-xl font-semibold mb-6 text-gray-900 '>Gestiona tus usuarios</h2>

        {/* Botón para cerrar el componente completo */}
        {onClose && (
          <button
            type='button'
            onClick={onClose}
            className='text-info hover:text-peligro text-lg leading-none hover:scale-140 transition-transform duration-300'
            aria-label='Cerrar panel de usuarios'>
            <IoClose className='w-10 h-10' />
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className='rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
          Solo el administrador puede crear/editar/eliminar usuarios. Puedes visualizar el listado.
        </div>
      )}

      <form onSubmit={submitUsuario} className='grid grid-cols-1 md:grid-cols-12 gap-4'>
        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Nombre completo</label>
          <input
            type='text'
            placeholder='Ej: Juan Pérez'
            value={form.nombre_completo}
            onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}
          />
        </div>

        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Email</label>
          <input
            type='email'
            placeholder='Ej: correo@empresa.cl'
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}
          />
        </div>

        <div className='md:col-span-4 relative'>
          <label className='block text-xs text-gray-600 mb-1'>Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={editId ? 'Debe cambiar la contraseña' : 'Ej: Admin@2025'}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full pr-10'
            disabled={!isAdmin}
          />
          <button
            type='button'
            onClick={() => setShowPassword((v) => !v)}
            className='absolute right-3 top-8 text-gray-500 hover:text-gray-700'
            tabIndex={-1}>
            {showPassword ? <FaRegEye /> : <FaRegEyeSlash />}
          </button>
        </div>

        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Teléfono</label>
          <input
            type='text'
            placeholder='+56 9 4444 4444'
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}
          />
        </div>

        {/* 🔹 Sucursales múltiples en dropdown tipo select */}
        <div className='md:col-span-4 relative' ref={dropdownRef}>
          <label className='block text-xs text-gray-600 mb-1'>Sucursales asignadas</label>

          <button
            type='button'
            disabled={!isAdmin}
            onClick={() => setOpenSucursales((o) => !o)}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full flex items-center justify-between text-sm bg-white disabled:bg-gray-100'>
            <span className={form.sucursales_ids && form.sucursales_ids.length ? 'text-gray-900' : 'text-gray-400'}>
              {form.sucursales_ids && form.sucursales_ids.length
                ? `${form.sucursales_ids.length} sucursal(es) seleccionada(s)`
                : 'Seleccionar sucursales'}
            </span>
            <span className='ml-2 text-gray-500 text-xs'>{openSucursales ? '▲' : '▼'}</span>
          </button>

          {openSucursales && (
            <div className='absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto'>
              {sucursalesFiltradas.length === 0 ? (
                <div className='px-3 py-2 text-xs text-gray-500'>No hay sucursales disponibles.</div>
              ) : (
                <div className='py-2'>
                  {sucursalesFiltradas.map((s) => (
                    <label
                      key={s.id}
                      className='flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer'>
                      <input
                        type='checkbox'
                        disabled={!isAdmin}
                        checked={isSucursalChecked(s.id)}
                        onChange={() => toggleSucursalEnForm(s.id)}
                      />
                      <span>{s.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className='mt-1 text-xs text-gray-500'>
            Puedes asignar más de una sucursal. La primera seleccionada se usará como principal.
          </p>
        </div>

        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Rol</label>
          <select
            value={form.rol_id}
            onChange={(e) => setForm((f) => ({ ...f, rol_id: e.target.value }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}>
            <option value=''>Seleccione rol</option>
            {rolesLimitados.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Estado</label>
          <select
            value={form.estado ? '1' : '0'}
            onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value === '1' }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}>
            <option value='1'>Activo</option>
            <option value='0'>Inactivo</option>
          </select>
        </div>

        <div className='md:col-span-12 flex justify-between gap-2'>
          <Button type='submit' disabled={!isAdmin || saving} color='primario'>
            {editId ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
          {editId && (
            <Button type='button' onClick={resetForm} color='peligro'>
              Cancelar
            </Button>
          )}
          <Button type='button' onClick={() => setShowDisabled((v) => !v)} color='secundario'>
            {showDisabled ? 'Ocultar deshabilitados' : 'Mostrar deshabilitados'}
          </Button>
        </div>
      </form>

      {errorMsg && <div className='text-red-700 text-sm'>{errorMsg}</div>}

      <table className='min-w-full divide-y divide-gray-200'>
        <thead>
          <tr className='bg-gray-50'>
            <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Nombre</th>
            <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Email</th>
            <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Rol</th>
            <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Teléfono</th>
            <th className='px-4 py-2 text-xs font-semibold text-gray-500 uppercase'>Acciones</th>
          </tr>
        </thead>
        <tbody className='bg-white divide-y divide-gray-200'>
          {usuarios.length === 0 ? (
            <tr>
              <td colSpan='5' className='text-center py-4 text-sm text-gray-500'>
                {showDisabled ? 'No hay usuarios registrados.' : 'No hay usuarios activos.'}
              </td>
            </tr>
          ) : (
            usuarios.map((u) => (
              <tr key={u.id ?? u.email}>
                <td className='px-4 py-2 text-sm text-gray-900'>{u.nombre_completo}</td>
                <td className='px-4 py-2 text-sm text-gray-700'>{u.email}</td>
                <td className='px-4 py-2 text-sm text-gray-700'>{u.rol_nombre ?? u.rol_id ?? '—'}</td>
                <td className='px-4 py-2 text-sm text-gray-700'>{u.telefono ?? '—'}</td>
                <td className='px-4 py-2 text-right space-x-2'>
                  <Button onClick={() => startEdit(u)} disabled={!isAdmin || !!busyId} color='info'>
                    Editar
                  </Button>

                  {u.estado !== false ? (
                    <Button onClick={() => deshabilitar(u)} disabled={!isAdmin || busyId === u.id} color='neutral'>
                      Deshabilitar
                    </Button>
                  ) : (
                    <Button onClick={() => habilitar(u)} disabled={!isAdmin || busyId === u.id} color='neutral'>
                      Habilitar
                    </Button>
                  )}

                  <Button onClick={() => eliminar(u)} disabled={!isAdmin || busyId === u.id} color='peligro'>
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
};
