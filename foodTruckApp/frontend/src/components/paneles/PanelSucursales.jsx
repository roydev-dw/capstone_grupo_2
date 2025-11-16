import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '../ui/Button';
import { empresasRepo } from '../../utils/repoEmpresas';
import { sucursalesRepo } from '../../utils/repoSucursales';
import { usuariosRepo } from '../../utils/repoUsuarios';

export const PanelSucursales = ({
  empresaId,
  isAdmin = false,
  adminUser = null,
  onAdminUpdated,
  onSucursalesUpdated,
}) => {
  const lockedEmpresaId = empresaId !== undefined && empresaId !== null && empresaId !== '' ? String(empresaId) : '';
  const [empresas, setEmpresas] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingAdmin, setUpdatingAdmin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState(lockedEmpresaId);
  const [showDisabled, setShowDisabled] = useState(false);
  const [editId, setEditId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [form, setForm] = useState({
    empresa_id: lockedEmpresaId,
    nombre: '',
    direccion: '',
    telefono: '',
    estado: true,
  });

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 ' +
    'focus:outline-none focus:ring-2 focus:ring-secundario focus:border-secundario';

  useEffect(() => {
    setEmpresaFiltro(lockedEmpresaId);
    setForm((prev) => ({ ...prev, empresa_id: lockedEmpresaId }));
  }, [lockedEmpresaId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const empresaIdParam = lockedEmpresaId ? Number(lockedEmpresaId) : undefined;
      const [emp, suc] = await Promise.all([empresasRepo.list(), sucursalesRepo.list({ empresaId: empresaIdParam })]);
      const empresasVisibles = lockedEmpresaId ? emp.filter((empresa) => String(empresa.id) === lockedEmpresaId) : emp;
      setEmpresas(empresasVisibles);
      setSucursales(suc);
    } catch (err) {
      setErrorMsg(err?.message ?? 'No pudimos cargar sucursales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [lockedEmpresaId]);

  const filteredSucursales = useMemo(() => {
    let base = sucursales;
    if (empresaFiltro) {
      base = base.filter((s) => Number(s.empresa_id) === Number(empresaFiltro));
    }
    if (!showDisabled) {
      base = base.filter((s) => s.estado !== false);
    }
    return base;
  }, [sucursales, empresaFiltro, showDisabled]);

  const syncAdminSucursales = async (nuevaSucursalId, empresaAsignada) => {
    if (!isAdmin || (!adminUser?.id && !adminUser?.usuario_id)) return;

    try {
      setUpdatingAdmin(true);

      const adminId = Number(adminUser.id ?? adminUser.usuario_id);

      const adminDetalle = await usuariosRepo.get(adminId);

      const actuales = new Set(
        (adminDetalle.sucursales_ids && adminDetalle.sucursales_ids.length
          ? adminDetalle.sucursales_ids
          : adminDetalle.sucursal_id
          ? [adminDetalle.sucursal_id]
          : []
        ).map((value) => Number(value))
      );

      actuales.add(Number(nuevaSucursalId));

      const adminEmpresaId = Number(
        adminDetalle.empresa_id ?? adminUser.empresa_id ?? empresaAsignada ?? lockedEmpresaId ?? empresaId
      );

      const payload = {
        sucursales: Array.from(actuales),
        empresa_id: Number.isFinite(adminEmpresaId) ? adminEmpresaId : Number(empresaAsignada),
      };

      await usuariosRepo.patch(adminDetalle.id, payload);

      const refreshed = await usuariosRepo.get(adminDetalle.id);
      onAdminUpdated?.(refreshed);
    } catch (err) {
      console.error('No se pudo actualizar el administrador con la nueva sucursal', err);
      toast.error('Sucursal creada, pero no pudimos actualizar los permisos del administrador.');
    } finally {
      setUpdatingAdmin(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setForm({
      empresa_id: lockedEmpresaId,
      nombre: '',
      direccion: '',
      telefono: '',
      estado: true,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Solo el administrador puede crear o editar sucursales');
      return;
    }
    const empresaSeleccionada = lockedEmpresaId || form.empresa_id || empresaFiltro;
    if (!empresaSeleccionada) {
      toast.error('Selecciona una empresa');
      return;
    }
    if (lockedEmpresaId && empresaSeleccionada !== lockedEmpresaId) {
      toast.error('Solo puedes gestionar sucursales de tu empresa');
      return;
    }
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    const empresaFinal = Number(lockedEmpresaId || empresaSeleccionada);
    if (!Number.isFinite(empresaFinal)) {
      toast.error('La empresa seleccionada no es válida');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      if (editId) {
        await sucursalesRepo.update(editId, {
          empresa_id: empresaFinal,
          nombre: form.nombre.trim(),
          direccion: form.direccion.trim(),
          telefono: form.telefono.trim(),
          estado: form.estado,
        });
        toast.success('Sucursal actualizada');
      } else {
        const nuevaSucursal = await sucursalesRepo.create({
          empresa_id: empresaFinal,
          nombre: form.nombre.trim(),
          direccion: form.direccion.trim(),
          telefono: form.telefono.trim(),
          estado: form.estado,
        });
        toast.success('Sucursal creada');
        await syncAdminSucursales(nuevaSucursal.id, empresaFinal);
      }
      resetForm();
      await loadData();
      await onSucursalesUpdated?.();
    } catch (err) {
      const msg = err?.message || 'No se pudo guardar la sucursal';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (sucursal) => {
    setEditId(sucursal.id);
    setForm({
      empresa_id: sucursal.empresa_id != null ? String(sucursal.empresa_id) : lockedEmpresaId,
      nombre: sucursal.nombre ?? '',
      direccion: sucursal.direccion ?? '',
      telefono: sucursal.telefono ?? '',
      estado: sucursal.estado ?? true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const actualizarEstadoSucursal = async (sucursal, nuevoEstado) => {
    if (!isAdmin) {
      toast.error('Solo el administrador puede cambiar el estado de las sucursales');
      return;
    }
    if (!confirm(`Esto ${nuevoEstado ? 'mostrará' : 'ocultará'} la sucursal. ¿Deseas continuar?`)) return;
    setBusyId(sucursal.id);
    try {
      await sucursalesRepo.update(sucursal.id, {
        empresa_id: sucursal.empresa_id,
        nombre: sucursal.nombre,
        direccion: sucursal.direccion ?? '',
        telefono: sucursal.telefono ?? '',
        estado: nuevoEstado,
      });
      await loadData();
      await onSucursalesUpdated?.();
      toast.success(nuevoEstado ? 'Sucursal habilitada' : 'Sucursal deshabilitada');
    } catch (err) {
      toast.error('No se pudo actualizar el estado de la sucursal');
    } finally {
      setBusyId(null);
    }
  };

  const eliminarSucursal = async (sucursal) => {
    if (!isAdmin) {
      toast.error('Solo el administrador puede eliminar sucursales');
      return;
    }
    if (!confirm('Esto eliminará la sucursal definitivamente. ¿Deseas continuar?')) return;
    setBusyId(sucursal.id);
    try {
      await sucursalesRepo.destroy(sucursal.id);
      await loadData();
      await onSucursalesUpdated?.();
      toast.success('Sucursal eliminada definitivamente');
    } catch (err) {
      toast.error('No se pudo eliminar la sucursal');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className='rounded-3xl bg-elemento p-6 shadow-lg shadow-placeholder space-y-6 mt-20'>
      <div className='flex flex-wrap items-start justify-between gap-4 mb-8'>
        <div>
          <h2 className='text-xl font-semibold'>Crea sucursales y conecta equipos</h2>
          <p className='text-sm text-texto-suave'>
            Cada sucursal puede tener su propio catálogo, equipos y listas de productos.
          </p>
        </div>
        <Button type='button' onClick={() => setShowDisabled((v) => !v)} color='secundario'>
          {showDisabled ? 'Ocultar deshabilitadas' : 'Mostrar deshabilitadas'}
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <div>
          <span className='text-lg uppercase font-semibold tracking-wider'>
            {empresas.find((e) => String(e.id) === String(empresaFiltro))?.nombre ?? ''}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <div className='md:col-span-2'>
          <label className='block text-xs text-gray-600 mb-1'>Nombre de la sucursal</label>
          <input
            type='text'
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            placeholder='Ej: Sucursal Providencia'
            className={inputClass}
            disabled={!isAdmin}
          />
        </div>
        <div className='md:col-span-2'>
          <label className='block text-xs text-gray-600 mb-1'>Dirección</label>
          <input
            type='text'
            value={form.direccion}
            onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
            placeholder='Av. Siempre Viva 742'
            className={inputClass}
            disabled={!isAdmin}
          />
        </div>
        <div>
          <label className='block text-xs text-gray-600 mb-1'>Teléfono</label>
          <input
            type='tel'
            value={form.telefono}
            onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
            placeholder='229876543'
            className={inputClass}
            disabled={!isAdmin}
          />
        </div>
        <div>
          <label className='block text-xs text-gray-600 mb-1'>Estado</label>
          <select
            value={form.estado ? '1' : '0'}
            onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value === '1' }))}
            className={inputClass}
            disabled={!isAdmin}>
            <option value='1'>Activa</option>
            <option value='0'>Inactiva</option>
          </select>
        </div>
        <div className='md:col-span-4 flex justify-end gap-2'>
          <Button type='submit' disabled={!isAdmin || saving || updatingAdmin} color='primario'>
            {updatingAdmin ? 'Actualizando permisos...' : editId ? 'Guardar cambios' : 'Crear sucursal'}
          </Button>
          {editId && (
            <Button type='button' onClick={resetForm} color='peligro'>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {errorMsg && <p className='text-sm text-red-600'>{errorMsg}</p>}

      <div className='overflow-x-auto'>
        <table className='min-w-full divide-y divide-gray-200 text-sm'>
          <thead className='bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500'>
            <tr>
              <th className='px-4 py-2'>Nombre</th>
              <th className='px-4 py-2'>Empresa</th>
              <th className='px-4 py-2'>Dirección</th>
              <th className='px-4 py-2'>Teléfono</th>
              <th className='px-4 py-2 text-center'>Estado</th>
              <th className='px-4 py-2 text-xs text-right'>Acciones</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200 bg-white'>
            {loading ? (
              <tr>
                <td colSpan='6' className='px-4 py-6 text-center text-gray-500'>
                  Cargando sucursales...
                </td>
              </tr>
            ) : filteredSucursales.length === 0 ? (
              <tr>
                <td colSpan='6' className='px-4 py-6 text-center text-gray-500'>
                  {showDisabled ? 'No hay sucursales registradas.' : 'No hay sucursales activas para este filtro.'}
                </td>
              </tr>
            ) : (
              filteredSucursales.map((sucursal) => {
                const empresaNombre =
                  empresas.find((emp) => Number(emp.id) === Number(sucursal.empresa_id))?.nombre || 'Sin empresa';
                return (
                  <tr
                    key={sucursal.id}
                    className={sucursal.estado === false ? 'opacity-70 hover:bg-gray-50' : 'hover:bg-gray-50'}>
                    <td className='px-4 py-2 text-texto font-medium'>{sucursal.nombre}</td>
                    <td className='px-4 py-2 text-gray-600'>{empresaNombre}</td>
                    <td className='px-4 py-2 text-gray-600'>{sucursal.direccion || 'Sin dirección'}</td>
                    <td className='px-4 py-2 text-gray-600'>{sucursal.telefono || 'Sin teléfono'}</td>
                    <td className='px-4 py-2 text-center'>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          sucursal.estado ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                        {sucursal.estado ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className='px-4 py-2 text-right space-x-2'>
                      <Button
                        onClick={() => startEdit(sucursal)}
                        disabled={!isAdmin || !!busyId}
                        color='info'
                        size='md'>
                        Editar
                      </Button>
                      <Button
                        onClick={() => actualizarEstadoSucursal(sucursal, sucursal.estado === false ? true : false)}
                        disabled={!isAdmin || busyId === sucursal.id}
                        color='neutral'>
                        {sucursal.estado === false ? 'Mostrar' : 'Ocultar'}
                      </Button>
                      <Button
                        onClick={() => eliminarSucursal(sucursal)}
                        disabled={!isAdmin || busyId === sucursal.id}
                        color='peligro'>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
