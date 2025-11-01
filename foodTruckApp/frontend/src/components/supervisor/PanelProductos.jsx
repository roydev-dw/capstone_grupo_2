// src/components/supervisor/ProductosPanel.jsx
import { useEffect, useState, useRef } from 'react';
import { productosRepo } from '../../utils/repoProductos';
import { toast } from 'react-hot-toast';
import { Button } from '../ui/Button';

export const PanelProductos = ({ categoriasActivas = [] }) => {
  const [productos, setProductos] = useState([]);
  const [prodSource, setProdSource] = useState('cache');
  const [loadingProd, setLoadingProd] = useState(true);
  const [showDisabledProd, setShowDisabledProd] = useState(false);

  const [formProd, setFormProd] = useState({
    categoria_id: '',
    nombre: '',
    descripcion: '',
    precio_base: '',
    tiempo_preparacion: '',
    imagen_url: '',
    imagen_file: null,
    estado: true,
  });
  const [previewUrl, setPreviewUrl] = useState('');
  const [editProdId, setEditProdId] = useState(null);
  const [busyProdId, setBusyProdId] = useState(null);
  const [savingProd, setSavingProd] = useState(false);
  const [errorProd, setErrorProd] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (formProd.imagen_file) {
      const u = URL.createObjectURL(formProd.imagen_file);
      setPreviewUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setPreviewUrl('');
  }, [formProd.imagen_file]);

  const cargarProductos = async () => {
    const { items, source } = await productosRepo.list();
    const filtrados = items.filter((p) =>
      showDisabledProd ? true : p.estado !== false
    );
    setProductos(filtrados);
    setProdSource(source);
  };

  useEffect(() => {
    (async () => {
      setLoadingProd(true);
      try {
        await cargarProductos();
      } catch (err) {
        setErrorProd(err?.message ?? 'Error cargando productos');
      } finally {
        setLoadingProd(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDisabledProd]);

  const resetFormProd = () => {
    setEditProdId(null);
    setFormProd({
      categoria_id: '',
      nombre: '',
      descripcion: '',
      precio_base: '',
      tiempo_preparacion: '',
      imagen_url: '',
      imagen_file: null,
      estado: true,
    });
    setPreviewUrl('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const submitProducto = async (e) => {
    e.preventDefault();
    const nombre = formProd.nombre.trim();
    const categoria_id = Number(formProd.categoria_id);
    if (!nombre || Number.isNaN(categoria_id)) {
      toast.error('Debe ingresar nombre y categoría');
      return;
    }
    setSavingProd(true);
    setErrorProd('');

    try {
      if (editProdId) {
        await productosRepo.update(editProdId, {
          categoria_id,
          nombre: formProd.nombre,
          descripcion: formProd.descripcion,
          precio_base: formProd.precio_base,
          tiempo_preparacion: formProd.tiempo_preparacion,
          imagen_file: formProd.imagen_file || null,
          imagen_url: formProd.imagen_url,
          estado: formProd.estado,
        });
        toast.success(`Producto “${nombre}” actualizado`);
      } else {
        const created = await productosRepo.create({
          categoria_id,
          nombre: formProd.nombre,
          descripcion: formProd.descripcion,
          precio_base: formProd.precio_base,
          tiempo_preparacion: formProd.tiempo_preparacion,
          imagen_file: formProd.imagen_file || null,
          imagen_url: formProd.imagen_url,
          estado: formProd.estado,
        });
        toast.success(`Producto “${created?.nombre ?? nombre}” creado`);
      }
      resetFormProd();
      await cargarProductos();
    } catch (err) {
      const msg =
        err?.data?.detail ||
        err?.data?.message ||
        err?.message ||
        'No se pudo guardar el producto';
      setErrorProd(String(msg));
      toast.error(msg);
    } finally {
      setSavingProd(false);
    }
  };

  const startEditProducto = (p) => {
    setEditProdId(p.producto_id);
    setFormProd({
      categoria_id: p.categoria_id ?? '',
      nombre: p.nombre ?? '',
      descripcion: p.descripcion ?? '',
      precio_base: p.precio_base ?? '',
      tiempo_preparacion: p.tiempo_preparacion ?? '',
      imagen_url: p.imagen_url ?? '',
      imagen_file: null,
      estado: p.estado ?? true,
    });
    setPreviewUrl('');
    if (inputRef.current) inputRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const habilitarProducto = async (id) => {
    setBusyProdId(id);
    try {
      await productosRepo.patchEstado(id, true);
      await cargarProductos();
      toast.success('Producto habilitado');
    } catch {
      toast.error('No se pudo habilitar');
    } finally {
      setBusyProdId(null);
    }
  };

  const deshabilitarProducto = async (id) => {
    if (!confirm('Esto deshabilitará el producto. ¿Desea continuar?')) return;
    setBusyProdId(id);
    try {
      await productosRepo.patchEstado(id, false);
      await cargarProductos();
      toast.success('Producto deshabilitado');
    } catch {
      toast.error('No se pudo deshabilitar');
    } finally {
      setBusyProdId(null);
    }
  };

  const eliminarProducto = async (id) => {
    if (
      !confirm('Esto eliminará el producto definitivamente. ¿Desea continuar?')
    )
      return;
    setBusyProdId(id);
    try {
      await productosRepo.destroy(id);
      await cargarProductos();
      toast.success('Producto eliminado definitivamente');
    } catch {
      toast.error('No se pudo eliminar');
    } finally {
      setBusyProdId(null);
    }
  };

  const handleImagenFile = (e) => {
    const file = e.target.files?.[0] || null;
    setFormProd((f) => ({
      ...f,
      imagen_file: file,
    }));
  };

  const openPicker = () => inputRef.current?.click();

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFormProd((f) => ({ ...f, imagen_file: file }));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const clearImage = () => {
    setFormProd((f) => ({ ...f, imagen_file: null }));
    setPreviewUrl('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-gray-900">Productos</h2>

        <Button
          type="button"
          onClick={() => setShowDisabledProd((v) => !v)}
          size="md"
          color="secundario"
        >
          {showDisabledProd
            ? 'Ocultar deshabilitados'
            : 'Mostrar deshabilitados'}
        </Button>
      </div>

      {/* Formulario producto */}
      <form
        onSubmit={submitProducto}
        className="grid grid-cols-1 md:grid-cols-12 gap-4"
      >
        <div className="md:col-span-3">
          <label className="block text-xs text-gray-600 mb-1">Categoría</label>
          <select
            value={formProd.categoria_id}
            onChange={(e) =>
              setFormProd((f) => ({ ...f, categoria_id: e.target.value }))
            }
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          >
            <option value="">Seleccione…</option>
            {categoriasActivas.map((c) => (
              <option key={c.categoria_id} value={c.categoria_id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs text-gray-600 mb-1">Nombre</label>
          <input
            type="text"
            value={formProd.nombre}
            onChange={(e) =>
              setFormProd((f) => ({ ...f, nombre: e.target.value }))
            }
            placeholder="Nombre del producto"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">
            Precio base
          </label>
          <input
            type="text"
            value={formProd.precio_base}
            onChange={(e) =>
              setFormProd((f) => ({ ...f, precio_base: e.target.value }))
            }
            placeholder="2900.00"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">
            Tiempo prep. (min)
          </label>
          <input
            type="number"
            value={formProd.tiempo_preparacion}
            onChange={(e) =>
              setFormProd((f) => ({ ...f, tiempo_preparacion: e.target.value }))
            }
            placeholder="5"
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Estado</label>
          <select
            value={formProd.estado ? '1' : '0'}
            onChange={(e) =>
              setFormProd((f) => ({ ...f, estado: e.target.value === '1' }))
            }
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          >
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </div>

        <div className="md:col-span-12">
          <label className="block text-xs text-gray-600 mb-1">
            Descripción
          </label>
          <textarea
            value={formProd.descripcion}
            onChange={(e) =>
              setFormProd((f) => ({ ...f, descripcion: e.target.value }))
            }
            placeholder="Descripción (opcional)"
            rows={2}
            className="border border-gray-300 rounded-lg px-3 py-2 w-full"
          />
        </div>

        {/* === IMAGEN con drag & drop mejor distribuido === */}
        <div className="md:col-span-full">
          <label className="block text-xs text-gray-600 mb-1">Imagen</label>

          {/* Layout: imagen grande izquierda, botones a la derecha */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Zona cuadrada drag & drop / preview */}
            <div className="md:col-span-8">
              <div
                role="button"
                aria-label="Zona para subir imagen"
                tabIndex={0}
                onClick={openPicker}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={[
                  // ancho controlado + alto fijo para que no se vea alargado
                  'relative w-full h-72 md:h-80 rounded-xl border-2 overflow-hidden',
                  'transition cursor-pointer flex items-center justify-center',
                  isDragging
                    ? 'border-info bg-info/10'
                    : 'border-dashed border-placeholder hover:border-info hover:bg-info/10',
                ].join(' ')}
              >
                {previewUrl || formProd.imagen_url ? (
                  <img
                    src={previewUrl || formProd.imagen_url}
                    alt="Imagen del producto"
                    className="w-full h-full object-cover bg-white"
                  />
                ) : (
                  <div className="flex flex-col items-center text-placeholder text-center px-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-10 w-10 mb-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path strokeWidth="2" d="M12 5v14m-7-7h14" />
                    </svg>
                    <span className="text-xs">
                      Arrastra tu imagen aquí o haz clic para seleccionar
                    </span>
                  </div>
                )}

                {/* Input real (oculto) */}
                <input
                  ref={inputRef}
                  id="imagenInput"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleImagenFile(e); // tu lógica intacta
                  }}
                />
              </div>
            </div>

            {/* Botones a la derecha, columna fija */}
            <div className="md:col-span-4">
              <div className="flex flex-col justify-between h-full gap-3">
                <Button onClick={openPicker} color="info" className="w-full">
                  Seleccionar imagen
                </Button>

                <Button
                  onClick={clearImage}
                  disabled={!previewUrl && !formProd.imagen_file}
                  color="peligro"
                  className="w-full"
                >
                  Quitar
                </Button>

                <button
                  type="submit"
                  disabled={
                    savingProd ||
                    !formProd.nombre.trim() ||
                    !String(formProd.categoria_id).trim()
                  }
                  className="px-4 py-2 rounded-lg bg-primario text-white font-semibold disabled:opacity-50 w-full"
                >
                  {editProdId ? 'Guardar cambios' : 'Crear producto'}
                </button>

                {editProdId && (
                  <button
                    type="button"
                    onClick={resetFormProd}
                    className="px-4 py-2 border rounded-lg w-full"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>

      {errorProd && <div className="text-red-700 text-sm">{errorProd}</div>}

      {loadingProd ? (
        <div className="py-4 text-sm text-gray-500">Cargando productos…</div>
      ) : (
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
                Categoría
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                Precio
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                Tiempo
              </th>
              <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productos.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="text-center py-4 text-sm text-gray-500"
                >
                  {showDisabledProd
                    ? 'No hay productos registrados.'
                    : 'No hay productos activos.'}
                </td>
              </tr>
            ) : (
              productos.map((p) => (
                <tr
                  key={p.producto_id}
                  className={`hover:bg-gray-50 ${
                    p.estado === false ? 'opacity-70' : ''
                  }`}
                >
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {p.producto_id}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {p.nombre}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {p.categoria_nombre || p.categoria_id || '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {p.precio_base || '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {p.tiempo_preparacion != null
                      ? `${p.tiempo_preparacion} min`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      onClick={() => startEditProducto(p)}
                      disabled={!!busyProdId}
                      className="px-3 py-1 bg-primario/10 text-primario rounded-md hover:bg-primario/20 disabled:opacity-50"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() =>
                        p.estado !== false
                          ? habilitarProducto(p.producto_id)
                          : deshabilitarProducto(p.producto_id)
                      }
                      disabled={busyProdId === p.producto_id}
                      className="px-3 py-1 rounded-md border hover:bg-gray-50 disabled:opacity-50"
                    >
                      {p.estado !== false ? 'Ocultar' : 'Mostrar'}
                    </button>

                    <button
                      onClick={() => eliminarProducto(p.producto_id)}
                      disabled={busyProdId === p.producto_id}
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
      )}
    </section>
  );
};
