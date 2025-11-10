import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '../ui/Button';
import { usuariosRepo } from '../../utils/repoUsuarios';
import { empresasRepo } from '../../utils/repoEmpresas';
import { sucursalesRepo } from '../../utils/repoSucursales';
import { rolesRepo } from '../../utils/roles';
import { userSchema } from '../validations/userValidation';
import { FaRegEye, FaRegEyeSlash } from 'react-icons/fa';

export const PanelUsuarios = ({ empresaId, sucursalId, isAdmin = false }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDisabled, setShowDisabled] = useState(false);

  const [empresas, setEmpresas] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [roles, setRoles] = useState([]);

  const [form, setForm] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    empresa_id: empresaId ?? '',
    sucursal_id: sucursalId ?? '',
    rol_id: '',
    estado: true,
  });

  const [editId, setEditId] = useState(null);
  const [busyId, setBusyId] = useState(null); // puedes dejarlo aunque no se use aún
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const cargarUsuarios = async () => {
    const items = await usuariosRepo.list();
    const filtrados = items.filter((u) => (showDisabled ? true : u.estado !== false));
    setUsuarios(filtrados);
  };

  const cargarMetadatos = async () => {
    const [emp, suc, r] = await Promise.all([empresasRepo.list(), sucursalesRepo.list(), rolesRepo.list()]);
    setEmpresas(emp);
    setSucursales(suc);
    setRoles(r);
  };

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDisabled]);

  const resetForm = () => {
    setEditId(null);
    setForm({
      nombre_completo: '',
      email: '',
      password: '',
      telefono: '',
      empresa_id: empresaId ?? '',
      sucursal_id: sucursalId ?? '',
      rol_id: '',
      estado: true,
    });
  };

  const submitUsuario = async (e) => {
    e.preventDefault();
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');

    // ✅ Validación con tu Yup schema (puedes descomentar abortEarly:false para múltiples mensajes)
    try {
      await userSchema.validate(form, { abortEarly: true });
    } catch (err) {
      const msg = err?.errors?.[0] || err?.message || 'Revisa los campos del formulario';
      setErrorMsg(String(msg));
      toast.error(msg);
      return;
    }

    const nombre = form.nombre_completo.trim();
    setSaving(true);
    setErrorMsg('');

    try {
      if (editId) {
        await usuariosRepo.update(editId, {
          ...form,
          empresa_id: Number(form.empresa_id),
          sucursal_id: Number(form.sucursal_id),
          rol_id: Number(form.rol_id),
          // password opcional: si viene "", backend debería ignorarla
        });
        toast.success(`Usuario “${nombre}” actualizado`);
      } else {
        await usuariosRepo.create({
          ...form,
          empresa_id: Number(form.empresa_id),
          sucursal_id: Number(form.sucursal_id),
          rol_id: Number(form.rol_id),
        });
        toast.success(`Usuario “${nombre}” creado`);
      }
      resetForm();
      await cargarUsuarios();
    } catch (err) {
      const msg = err?.message || 'No se pudo guardar';
      setErrorMsg(String(msg));
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u) => {
    setEditId(u.id);
    setForm({
      nombre_completo: u.nombre_completo ?? '',
      email: u.email ?? '',
      password: '', // vacío para no forzar cambio
      telefono: u.telefono ?? '',
      empresa_id: u.empresa_id ?? empresaId ?? '',
      sucursal_id: u.sucursal_id ?? sucursalId ?? '',
      rol_id: u.rol_id ?? '',
      estado: u.estado ?? true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const habilitar = async (u) => {
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');
    setBusyId(u.id);
    try {
      await usuariosRepo.patch(u.id, { estado: true });
      await cargarUsuarios();
      toast.success('Usuario habilitado');
    } catch {
      toast.error('No se pudo habilitar');
    } finally {
      setBusyId(null);
    }
  };

  const deshabilitar = async (u) => {
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');
    if (!confirm('Esto deshabilitará el usuario. ¿Continuar?')) return;
    setBusyId(u.id);
    try {
      await usuariosRepo.disable(u.id);
      await cargarUsuarios();
      toast.success('Usuario deshabilitado');
    } catch {
      toast.error('No se pudo deshabilitar');
    } finally {
      setBusyId(null);
    }
  };

  const eliminar = async (u) => {
    if (!isAdmin) return toast.error('Solo el administrador puede realizar esta acción.');
    if (!confirm('⛔ Esto eliminará el usuario definitivamente. ¿Continuar?')) return;
    setBusyId(u.id);
    try {
      await usuariosRepo.destroy(u.id);
      await cargarUsuarios();
      toast.success('Usuario eliminado definitivamente');
    } catch {
      toast.error('No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  const sucursalesFiltradas = String(form.empresa_id)
    ? sucursales.filter((s) => String(s.empresa_id) === String(form.empresa_id))
    : [];

  if (loading) {
    return (
      <section className='bg-white rounded-2xl shadow-sm border border-gray-100 p-6'>
        <p>Cargando usuarios…</p>
      </section>
    );
  }

  return (
    <section className='bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6'>
      <div className='flex items-center justify-between gap-4'>
        <h2 className='text-xl font-semibold text-gray-900'>Usuarios</h2>
        <Button
          type='button'
          onClick={() => setShowDisabled((v) => !v)}
          color='secundario'>
          {showDisabled ? 'Ocultar deshabilitados' : 'Mostrar deshabilitados'}
        </Button>
      </div>

      {!isAdmin && (
        <div className='rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
          Solo el administrador puede crear/editar/eliminar usuarios. Puedes visualizar el listado.
        </div>
      )}

      {/* Formulario */}
      <form
        onSubmit={submitUsuario}
        className='grid grid-cols-1 md:grid-cols-12 gap-4'>
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

        {/* Empresa (select por nombre) */}
        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Empresa</label>
          <select
            value={form.empresa_id}
            onChange={(e) => setForm((f) => ({ ...f, empresa_id: e.target.value, sucursal_id: '' }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}>
            <option value=''>Seleccione empresa</option>
            {empresas.map((e) => (
              <option
                key={e.id}
                value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Sucursal (filtrada por empresa) */}
        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Sucursal</label>
          <select
            value={form.sucursal_id}
            onChange={(e) => setForm((f) => ({ ...f, sucursal_id: e.target.value }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin || !String(form.empresa_id)}>
            <option value=''>Seleccione sucursal</option>
            {sucursalesFiltradas.map((s) => (
              <option
                key={s.id}
                value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Rol (por nombre) */}
        <div className='md:col-span-4'>
          <label className='block text-xs text-gray-600 mb-1'>Rol</label>
          <select
            value={form.rol_id}
            onChange={(e) => setForm((f) => ({ ...f, rol_id: e.target.value }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
            disabled={!isAdmin}>
            <option value=''>Seleccione rol</option>
            {roles.map((r) => (
              <option
                key={r.id}
                value={r.id}>
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

        <div className='md:col-span-12 flex gap-2'>
          <Button
            type='submit'
            disabled={!isAdmin || saving}
            color='primario'>
            {editId ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
          {editId && (
            <Button
              type='button'
              onClick={resetForm}
              color='peligro'>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {errorMsg && <div className='text-red-700 text-sm'>{errorMsg}</div>}

      {/* Tabla */}
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
              <td
                colSpan='5'
                className='text-center py-4 text-sm text-gray-500'>
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
                  <Button
                    onClick={() => startEdit(u)}
                    disabled={!isAdmin || !!busyId}
                    color='info'>
                    Editar
                  </Button>

                  {u.estado !== false ? (
                    <Button
                      onClick={() => deshabilitar(u)}
                      disabled={!isAdmin || busyId === u.id}
                      color='neutral'>
                      Deshabilitar
                    </Button>
                  ) : (
                    <Button
                      onClick={() => habilitar(u)}
                      disabled={!isAdmin || busyId === u.id}
                      color='neutral'>
                      Habilitar
                    </Button>
                  )}

                  <Button
                    onClick={() => eliminar(u)}
                    disabled={!isAdmin || busyId === u.id}
                    color='peligro'>
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
