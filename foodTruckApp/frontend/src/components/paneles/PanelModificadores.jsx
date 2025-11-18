import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { modificadoresRepo } from '../../utils/repoModificadores';
import { Button } from '../ui/Button';
import { IoClose } from 'react-icons/io5';

export const PanelModificadores = forwardRef(({ empresaId, sucursalId, onModificadoresChange, onClose }, ref) => {
  const [modificadores, setModificadores] = useState([]);
  const [loadingMods, setLoadingMods] = useState(true);
  const [showDisabledMods, setShowDisabledMods] = useState(false);
  const [errorMod, setErrorMod] = useState('');
  const [savingMod, setSavingMod] = useState(false);
  const [editModId, setEditModId] = useState(null);
  const [busyModId, setBusyModId] = useState(null);
  const [formMod, setFormMod] = useState({
    nombre: '',
    tipo: '',
    descripcion: '',
    valor_adicional: '',
    estado: true,
  });

  const sectionRef = useRef(null);

  useImperativeHandle(ref, () => ({
    scrollIntoView: () => {
      sectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    },
  }));

  const notificarCambios = (items) => {
    const activos = items.filter((m) => m.estado !== false);
    if (typeof onModificadoresChange === 'function') {
      onModificadoresChange(activos);
    }
  };

  const cargarModificadores = async () => {
    if (!empresaId) {
      setModificadores([]);
      notificarCambios([]);
      return;
    }
    const { items } = await modificadoresRepo.list({
      empresaId,
      includeDisabled: true,
    });
    setModificadores(items);
    notificarCambios(items);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingMods(true);
      setErrorMod('');
      try {
        await cargarModificadores();
      } catch (err) {
        if (!mounted) return;
        setErrorMod(err?.message ?? 'Error cargando modificadores');
      } finally {
        if (!mounted) return;
        setLoadingMods(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [empresaId]);

  const resetFormMod = () => {
    setEditModId(null);
    setFormMod({
      nombre: '',
      tipo: '',
      descripcion: '',
      valor_adicional: '',
      estado: true,
    });
  };

  const submitModificador = async (e) => {
    e.preventDefault();
    const nombre = formMod.nombre.trim();
    if (!nombre) {
      toast.error('Debe ingresar un nombre');
      return;
    }
    if (!empresaId) {
      toast.error('No se puede crear modificadores sin empresa asociada.');
      return;
    }

    setSavingMod(true);
    setErrorMod('');
    const payload = {
      ...formMod,
      empresa_id: empresaId,
    };

    try {
      if (editModId) {
        await modificadoresRepo.update(editModId, payload);
        toast.success(`Modificador "${nombre}" actualizado`);
      } else {
        const created = await modificadoresRepo.create(payload);
        toast.success(`Modificador "${created?.nombre ?? nombre}" creado`);
      }
      resetFormMod();
      await cargarModificadores();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message || 'No se pudo guardar';
      setErrorMod(String(msg));
      toast.error(msg);
    } finally {
      setSavingMod(false);
    }
  };

  const startEditModificador = (mod) => {
    const identifier = mod.modificador_id ?? mod.id;
    setEditModId(identifier);
    setFormMod({
      nombre: mod.nombre ?? '',
      tipo: mod.tipo ?? '',
      descripcion: mod.descripcion ?? '',
      valor_adicional: mod.valor_adicional != null ? String(mod.valor_adicional) : '',
      estado: mod.estado !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleEstado = async (id, estado) => {
    if (!id) {
      toast.error('No se pudo identificar el modificador.');
      return;
    }
    setBusyModId(id);
    try {
      await modificadoresRepo.patchEstado(id, estado);
      await cargarModificadores();
      toast.success(estado ? 'Modificador habilitado' : 'Modificador ocultado');
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo actualizar el estado');
    } finally {
      setBusyModId(null);
    }
  };

  const eliminarModificador = async (id) => {
    if (!id) return;
    const confirmed =
      typeof window === 'undefined' ? true : window.confirm('Â¿Seguro que deseas eliminar el modificador?');
    if (!confirmed) return;
    setBusyModId(id);
    try {
      await modificadoresRepo.remove(id, { hard: true });
      await cargarModificadores();
      toast.success('Modificador eliminado');
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo eliminar');
    } finally {
      setBusyModId(null);
    }
  };

  const visibleModificadores = showDisabledMods ? modificadores : modificadores.filter((m) => m.estado !== false);

  return (
    <section ref={sectionRef} className='bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6'>
      <div className='flex w-full justify-between items-center'>
        <h2 className='text-xl font-semibold text-gray-900'>Modificadores</h2>
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

      {/* Formulario */}
      <form onSubmit={submitModificador} className='grid grid-cols-1 md:grid-cols-6 gap-4'>
        <div className='md:col-span-3'>
          <label className='block text-xs text-gray-600 mb-1'>Nombre</label>
          <input
            type='text'
            value={formMod.nombre}
            onChange={(e) => setFormMod((f) => ({ ...f, nombre: e.target.value }))}
            placeholder='Ej: Extra Queso'
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
          />
        </div>

        <div className='md:col-span-3'>
          <label className='block text-xs text-gray-600 mb-1'>Tipo</label>
          <input
            type='text'
            value={formMod.tipo}
            onChange={(e) => setFormMod((f) => ({ ...f, tipo: e.target.value }))}
            placeholder='Ej: Ingrediente, Tamaño, Salsa...'
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
          />
        </div>

        <div className='md:col-span-3'>
          <label className='block text-xs text-gray-600 mb-1'>Valor adicional</label>
          <input
            type='number'
            min='0'
            step='1'
            value={formMod.valor_adicional}
            onChange={(e) => setFormMod((f) => ({ ...f, valor_adicional: e.target.value }))}
            placeholder='0'
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
          />
        </div>

        <div className='md:col-span-3'>
          <label className='block text-xs text-gray-600 mb-1'>Estado</label>
          <select
            value={formMod.estado ? '1' : '0'}
            onChange={(e) => setFormMod((f) => ({ ...f, estado: e.target.value === '1' }))}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'>
            <option value='1'>Activo</option>
            <option value='0'>Inactivo</option>
          </select>
        </div>

        <div className='md:col-span-6'>
          <label className='block text-xs text-gray-600 mb-1'>Descripción</label>
          <textarea
            value={formMod.descripcion}
            onChange={(e) => setFormMod((f) => ({ ...f, descripcion: e.target.value }))}
            placeholder='Detalle del modificador.'
            rows={3}
            className='border border-gray-300 rounded-lg px-3 py-2 w-full'
          />
        </div>

        <div className='md:col-span-6 flex flex-wrap gap-2 justify-between mt-10'>
          <div className='flex justify-between gap-2'>
            <Button type='submit' disabled={savingMod || !formMod.nombre.trim()} color='primario'>
              {editModId ? 'Guardar cambios' : 'Crear modificador'}
            </Button>
            {editModId && (
              <Button type='button' onClick={resetFormMod} color='peligro'>
                Cancelar
              </Button>
            )}
          </div>
          <Button onClick={() => setShowDisabledMods((v) => !v)} color='secundario'>
            {showDisabledMods ? 'Ocultar deshabilitados' : 'Mostrar deshabilitados'}
          </Button>
        </div>
      </form>

      {errorMod && <div className='text-red-700 text-sm'>{errorMod}</div>}

      {/* Tabla */}
      {loadingMods ? (
        <div className='py-4 text-sm text-gray-500'>Cargando modificadores...</div>
      ) : (
        <table className='min-w-full divide-y divide-gray-200'>
          <thead>
            <tr className='bg-gray-50'>
              <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Nombre</th>
              <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Tipo</th>
              <th className='px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase'>Valor adicional</th>
              <th className='px-4 py-2 text-xs font-semibold text-gray-500 uppercase'>Acciones</th>
            </tr>
          </thead>
          <tbody className='bg-white divide-y divide-gray-200'>
            {visibleModificadores.length === 0 ? (
              <tr>
                <td colSpan='4' className='text-center py-4 text-sm text-gray-500'>
                  {showDisabledMods ? 'No hay modificadores registrados.' : 'No hay modificadores activos.'}
                </td>
              </tr>
            ) : (
              visibleModificadores.map((mod) => {
                const rowId = mod.modificador_id ?? mod.id;
                return (
                  <tr
                    key={rowId ?? mod.nombre}
                    className={`hover:bg-gray-50 ${mod.estado === false ? 'opacity-70' : ''}`}>
                    <td className='px-4 py-2 text-sm text-gray-900'>{mod.nombre}</td>
                    <td className='px-4 py-2 text-sm text-gray-700'>{mod.tipo || '-'}</td>
                    <td className='px-4 py-2 text-sm text-gray-700'>
                      {mod.valor_adicional != null ? `$${mod.valor_adicional}` : '-'}
                    </td>
                    <td className='px-4 py-2 text-right space-x-2'>
                      <Button
                        onClick={() => startEditModificador(mod)}
                        disabled={!!busyModId}
                        className='px-3 py-1'
                        color='info'>
                        Editar
                      </Button>
                      <Button
                        onClick={() => (mod.estado !== false ? toggleEstado(rowId, false) : toggleEstado(rowId, true))}
                        disabled={busyModId === rowId}
                        color='neutral'
                        className='px-3 py-1'>
                        {mod.estado !== false ? 'Ocultar' : 'Mostrar'}
                      </Button>
                      <Button
                        onClick={() => eliminarModificador(rowId)}
                        disabled={busyModId === rowId}
                        color='peligro'
                        className='px-3 py-1'>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}
    </section>
  );
});
