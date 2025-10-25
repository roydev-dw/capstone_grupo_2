﻿// pages/Supervisor.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoriasRepo } from '../utils/repoCategorias';
import { Toaster, toast } from 'react-hot-toast';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { Logo } from '../components/logo/Logo';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { clearSession } from '../utils/session';

const SUCURSAL_ID = 1;
const SUCURSAL_NOMBRE = 'Sucursal Centro';

export const Supervisor = () => {
  const navigate = useNavigate();
  const [categorias, setCategorias] = useState([]);
  const [catSource, setCatSource] = useState('cache');
  const [loading, setLoading] = useState(true);
  const [showDisabled, setShowDisabled] = useState(false);

  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    estado: true,
  });
  const [editId, setEditId] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { user } = useCurrentUser();

  const logout = () => {
    clearSession();
    toast.success('Sesión cerrada');
    navigate('/login', { replace: true });
  };

  const cargarCategorias = async () => {
    const { items, source } = await categoriasRepo.listAll();
    const mezcladas = items.filter((c) =>
      showDisabled ? true : c.estado !== false
    );
    setCategorias(mezcladas);
    setCatSource(source);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await cargarCategorias();
      } catch (err) {
        setErrorMsg(err?.message ?? 'Error cargando categorías');
      } finally {
        setLoading(false);
      }
    })();
  }, [showDisabled]);

  const resetForm = () => {
    setEditId(null);
    setForm({
      nombre: '',
      descripcion: '',
      estado: true,
    });
  };

  const submitCategoria = async (e) => {
    e.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) return;
    setSaving(true);
    setErrorMsg('');

    try {
      if (editId) {
        await categoriasRepo.update(editId, {
          sucursal_id: SUCURSAL_ID,
          nombre: form.nombre,
          descripcion: form.descripcion,
          estado: form.estado,
        });
        toast.success(`Categoría “${nombre}” actualizada`);
      } else {
        const created = await categoriasRepo.create({
          sucursal_id: SUCURSAL_ID,
          nombre: form.nombre,
          descripcion: form.descripcion,
          estado: form.estado,
        });
        toast.success(`Categoría “${created?.nombre ?? nombre}” creada`);
      }
      resetForm();
      await cargarCategorias();
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'No se pudo guardar';
      setErrorMsg(String(msg));
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (cat) => {
    setEditId(cat.categoria_id);
    setForm({
      nombre: cat.nombre ?? '',
      descripcion: cat.descripcion ?? '',
      estado: cat.estado ?? true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deshabilitar = async (id) => {
    if (!confirm('¿Deshabilitar esta categoría?')) return;
    setBusyId(id);
    try {
      await categoriasRepo.disable(id);
      await cargarCategorias();
      toast.success('Categoría deshabilitada');
    } catch (err) {
      toast.error('No se pudo deshabilitar');
    } finally {
      setBusyId(null);
    }
  };

  const habilitar = async (id) => {
    setBusyId(id);
    try {
      await categoriasRepo.enable(id);
      await cargarCategorias();
      toast.success('Categoría habilitada');
    } catch (err) {
      toast.error('No se pudo habilitar');
    } finally {
      setBusyId(null);
    }
  };

  const eliminar = async (id) => {
    if (!confirm('⛔ Esto eliminará la categoría definitivamente. ¿Continuar?'))
      return;
    setBusyId(id);
    try {
      await categoriasRepo.destroy(id);
      await cargarCategorias();
      toast.success('Categoría eliminada');
    } catch (err) {
      toast.error('No se pudo eliminar');
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center">
        <p>Cargando categorías…</p>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      {/* Toaster */}
      <Toaster position="top-center" />

      {/* HEADER */}
      <header className="bg-elemento shadow-md flex justify-center">
        <div className="max-w-6xl flex items-center px-4 py-2">
          <div className="w-6xl flex justify-end">
            <Logo className="w-10 h-10" />
            <UserMenu user={user} onLogout={logout} />
          </div>
        </div>
      </header>

      {/* Contenido */}
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <div className="text-xs text-gray-500">
          Categorías · Origen:{' '}
          <span
            className={
              catSource === 'network' ? 'text-green-600' : 'text-yellow-700'
            }
          >
            {catSource === 'network' ? 'En línea' : 'Offline/cache'}
          </span>
        </div>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Categorías</h2>

            <button
              type="button"
              onClick={() => setShowDisabled((v) => !v)}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              {showDisabled
                ? 'Ocultar deshabilitadas'
                : 'Mostrar deshabilitadas'}
            </button>
          </div>

          {/* Sucursal */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-500 uppercase">Sucursal</div>
            <div className="text-sm font-medium text-gray-900">
              {SUCURSAL_NOMBRE}
            </div>
          </div>

          {/* Formulario */}
          <form
            onSubmit={submitCategoria}
            className="grid grid-cols-1 md:grid-cols-6 gap-4"
          >
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nombre: e.target.value }))
                }
                placeholder="Nombre categoría"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">Estado</label>
              <select
                value={form.estado ? '1' : '0'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estado: e.target.value === '1' }))
                }
                className="border border-gray-300 rounded-lg px-3 py-2 w-full"
              >
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </select>
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs text-gray-600 mb-1">
                Descripción
              </label>
              <textarea
                value={form.descripcion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descripcion: e.target.value }))
                }
                placeholder="Descripción (opcional)"
                rows={3}
                className="border border-gray-300 rounded-lg px-3 py-2 w-full"
              />
            </div>

            <div className="md:col-span-6 flex items-end gap-2">
              <button
                type="submit"
                disabled={saving || !form.nombre.trim()}
                className="px-4 py-2 rounded-lg bg-primario text-white font-semibold disabled:opacity-50"
              >
                {editId ? 'Guardar cambios' : 'Crear'}
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          {errorMsg && <div className="text-red-700 text-sm">{errorMsg}</div>}

          {/* Tabla */}
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                  ID
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                  Nombre
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                  Descripción
                </th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categorias.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="text-center py-4 text-sm text-gray-500"
                  >
                    {showDisabled
                      ? 'No hay categorías registradas.'
                      : 'No hay categorías activas.'}
                  </td>
                </tr>
              ) : (
                categorias.map((c) => (
                  <tr
                    key={c.categoria_id}
                    className={`hover:bg-gray-50 ${
                      c.estado === false ? 'opacity-70' : ''
                    }`}
                  >
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {c.categoria_id}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {c.nombre}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {c.descripcion || '—'}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        onClick={() => startEdit(c)}
                        disabled={!!busyId}
                        className="px-3 py-1 bg-primario/10 text-primario rounded-md hover:bg-primario/20 disabled:opacity-50"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() =>
                          c.estado !== false
                            ? deshabilitar(c.categoria_id)
                            : habilitar(c.categoria_id)
                        }
                        disabled={busyId === c.categoria_id}
                        className="px-3 py-1 rounded-md border hover:bg-gray-50 disabled:opacity-50"
                      >
                        {c.estado !== false ? 'Ocultar' : 'Mostrar'}
                      </button>

                      <button
                        onClick={() => eliminar(c.categoria_id)}
                        disabled={busyId === c.categoria_id}
                        className="px-3 py-1 bg-secundario/10 text-secundario rounded-md hover:bg-secundario/20 disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};
