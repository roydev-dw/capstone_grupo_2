import { useMemo, useState } from 'react';
import { initialFoodTrucks, supervisorProfiles } from '../utils/dataPrueba';

const defaultProductForm = {
  name: '',
  price: '',
  category: '',
  status: 'Disponible',
  stock: '',
};

const defaultScheduleForm = {
  name: '',
  shiftStart: '',
  shiftEnd: '',
  days: '',
};

const metricCardStyles =
  'bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm flex flex-col gap-1';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);

const formatDays = (days) => (Array.isArray(days) ? days.join(', ') : '');

const cloneTruck = (truck) =>
  truck
    ? {
        ...truck,
        metrics: { ...truck.metrics },
        products: truck.products.map((product) => ({ ...product })),
        staff: truck.staff.map((member) => ({
          ...member,
          days: [...member.days],
        })),
        categories: [...truck.categories],
      }
    : null;

export const Supervisor = () => {
  const fallbackSupervisor = {
    id: 'fallback',
    name: 'Supervisor',
    email: 'sin-email@empresa.cl',
    phone: 'N/A',
    foodTruckId: initialFoodTrucks[0]?.id ?? null,
    permissions: {
      canEditProducts: true,
      canEditSchedules: true,
    },
  };
  const supervisor = supervisorProfiles[0] ?? fallbackSupervisor;
  const permissionSummary = [
    supervisor.permissions?.canEditProducts ? 'Gestion de productos' : null,
    supervisor.permissions?.canEditSchedules ? 'Gestion de horarios' : null,
  ]
    .filter(Boolean)
    .join(' / ');
  const [truckData, setTruckData] = useState(() => {
    const assignedTruck = initialFoodTrucks.find(
      (truck) => truck.id === supervisor.foodTruckId
    );
    return cloneTruck(assignedTruck);
  });
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm);
  const [editingStaffId, setEditingStaffId] = useState(null);

  const truckMetrics = useMemo(() => {
    if (!truckData) return null;
    const availableProducts = truckData.products.filter(
      (product) => product.status === 'Disponible'
    ).length;
    return {
      salesThisMonth: truckData.metrics.salesThisMonth,
      satisfaction: truckData.metrics.satisfaction,
      products: truckData.products.length,
      availableProducts,
      staffCount: truckData.staff.length,
    };
  }, [truckData]);

  const resetProductForm = () => {
    setProductForm(defaultProductForm);
    setEditingProductId(null);
  };

  const resetScheduleForm = () => {
    setScheduleForm(defaultScheduleForm);
    setEditingStaffId(null);
  };

  const handleProductInputChange = (event) => {
    const { name, value } = event.target;
    setProductForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleScheduleInputChange = (event) => {
    const { name, value } = event.target;
    setScheduleForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmitProduct = (event) => {
    event.preventDefault();
    if (!truckData) return;

    const sanitizedProduct = {
      ...productForm,
      price: Number(productForm.price) || 0,
      stock: Number(productForm.stock) || 0,
      category: productForm.category.trim() || 'Sin categoria',
    };

    setTruckData((prev) => {
      if (!prev) return prev;

      let updatedProducts;
      if (editingProductId) {
        updatedProducts = prev.products.map((product) =>
          product.id === editingProductId
            ? { ...product, ...sanitizedProduct }
            : product
        );
      } else {
        const newProduct = {
          id: `prd-${Date.now()}`,
          ...sanitizedProduct,
        };
        updatedProducts = [...prev.products, newProduct];
      }

      const updatedCategories = Array.from(
        new Set(updatedProducts.map((product) => product.category))
      );

      return {
        ...prev,
        products: updatedProducts,
        categories: updatedCategories,
      };
    });

    resetProductForm();
  };

  const handleEditProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      price: product.price.toString(),
      category: product.category,
      status: product.status,
      stock: product.stock.toString(),
    });
  };

  const handleDeleteProduct = (productId) => {
    setTruckData((prev) => {
      if (!prev) return prev;
      const updatedProducts = prev.products.filter(
        (product) => product.id !== productId
      );
      const updatedCategories = Array.from(
        new Set(updatedProducts.map((product) => product.category))
      );

      return {
        ...prev,
        products: updatedProducts,
        categories: updatedCategories,
      };
    });

    if (editingProductId === productId) {
      resetProductForm();
    }
  };

  const handleEditSchedule = (staffMember) => {
    setEditingStaffId(staffMember.id);
    setScheduleForm({
      name: staffMember.name,
      shiftStart: staffMember.shiftStart,
      shiftEnd: staffMember.shiftEnd,
      days: formatDays(staffMember.days),
    });
  };

  const handleSubmitSchedule = (event) => {
    event.preventDefault();
    if (!editingStaffId) return;

    const normalizedDays = scheduleForm.days
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);

    setTruckData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        staff: prev.staff.map((member) =>
          member.id === editingStaffId
            ? {
                ...member,
                shiftStart: scheduleForm.shiftStart,
                shiftEnd: scheduleForm.shiftEnd,
                days: normalizedDays.length ? normalizedDays : member.days,
              }
            : member
        ),
      };
    });

    resetScheduleForm();
  };

  if (!truckData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-8 py-10 text-center space-y-4">
          <p className="text-xl font-semibold text-gray-900">
            No encontramos un foodtruck asignado para tu perfil.
          </p>
          <p className="text-gray-600">
            Contacta a tu administrador para validar tus permisos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-wide text-gray-500">
              Supervisor
            </p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">
              Hola, {supervisor.name}
            </h1>
            <p className="text-gray-600 mt-2">
              Gestiona el foodtruck{' '}
              <span className="font-semibold text-gray-900">
                {truckData.name}
              </span>{' '}
              ubicado en {truckData.location}.
            </p>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-900">Email:</span>{' '}
              {supervisor.email}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Telefono:</span>{' '}
              {supervisor.phone}
            </p>
            <p>
              <span className="font-semibold text-gray-900">Permisos:</span>{' '}
              {permissionSummary || 'Sin permisos asignados'}
            </p>
          </div>
        </header>

        {truckMetrics && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={metricCardStyles}>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Ventas mes
              </span>
              <span className="text-xl font-bold text-gray-900">
                {formatCurrency(truckMetrics.salesThisMonth)}
              </span>
            </div>
            <div className={metricCardStyles}>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Satisfaccion
              </span>
              <span className="text-xl font-bold text-gray-900">
                {truckMetrics.satisfaction.toFixed(1)}
              </span>
            </div>
            <div className={metricCardStyles}>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Productos activos
              </span>
              <span className="text-xl font-bold text-gray-900">
                {truckMetrics.products}
              </span>
              <span className="text-xs text-gray-500">
                {truckMetrics.availableProducts} disponibles
              </span>
            </div>
            <div className={metricCardStyles}>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Equipo asignado
              </span>
              <span className="text-xl font-bold text-gray-900">
                {truckMetrics.staffCount}
              </span>
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Productos disponibles
              </h2>
              <p className="text-sm text-gray-500">
                Actualiza precios, stock o estado de los productos de tu
                foodtruck.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {truckData.categories.length} categorias ·{' '}
              {truckData.products.length} productos
            </span>
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {truckData.products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-sm text-gray-500"
                    >
                      Todavia no registras productos. Agrega el primero usando
                      el formulario.
                    </td>
                  </tr>
                ) : (
                  truckData.products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {product.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {product.category}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {product.stock}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            product.status === 'Disponible'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleEditProduct(product)}
                          className="text-primary font-semibold hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id)}
                          className="text-red-600 font-semibold hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleSubmitProduct}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 pt-6"
          >
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingProductId ? 'Editar producto' : 'Nuevo producto'}
              </h3>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Nombre</span>
              <input
                type="text"
                name="name"
                value={productForm.name}
                onChange={handleProductInputChange}
                required
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">
                Categoria
              </span>
              <input
                type="text"
                name="category"
                value={productForm.category}
                onChange={handleProductInputChange}
                placeholder="Ej. Bebidas"
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Precio</span>
              <input
                type="number"
                name="price"
                value={productForm.price}
                onChange={handleProductInputChange}
                min="0"
                step="100"
                required
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">
                Stock disponible
              </span>
              <input
                type="number"
                name="stock"
                value={productForm.stock}
                onChange={handleProductInputChange}
                min="0"
                step="1"
                required
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Estado</span>
              <select
                name="status"
                value={productForm.status}
                onChange={handleProductInputChange}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="Disponible">Disponible</option>
                <option value="Agotado">Agotado</option>
              </select>
            </label>

            <div className="flex items-center gap-3 pt-4">
              <button
                type="submit"
                className="bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
              >
                {editingProductId ? 'Guardar cambios' : 'Crear producto'}
              </button>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="px-4 py-2 rounded-lg font-semibold border border-gray-300 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Horarios del equipo
              </h2>
              <p className="text-sm text-gray-500">
                Ajusta turnos y dias de asistencia del personal a cargo.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              Ultima sincronizacion: {truckData.lastSync}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {truckData.staff.map((member) => (
              <div
                key={member.id}
                className="border border-gray-200 rounded-xl px-4 py-4 flex flex-col gap-2 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {member.name}
                    </p>
                    <p className="text-sm text-gray-500">{member.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditSchedule(member)}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Editar horario
                  </button>
                </div>
                <div className="flex flex-wrap text-xs text-gray-600 gap-2">
                  <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">
                    {member.shiftStart} - {member.shiftEnd}
                  </span>
                  <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">
                    {formatDays(member.days)}
                  </span>
                </div>
                {member.phone && (
                  <p className="text-xs text-gray-500">
                    Contacto: {member.phone}
                  </p>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSubmitSchedule}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 pt-6"
          >
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingStaffId
                  ? `Actualizar horario de ${scheduleForm.name}`
                  : 'Selecciona un colaborador para editar su horario'}
              </h3>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">
                Colaborador
              </span>
              <input
                type="text"
                name="name"
                value={scheduleForm.name}
                readOnly
                placeholder="Selecciona desde la lista superior"
                className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Entrada
                </span>
                <input
                  type="time"
                  name="shiftStart"
                  value={scheduleForm.shiftStart}
                  onChange={handleScheduleInputChange}
                  required
                  disabled={!editingStaffId}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Salida
                </span>
                <input
                  type="time"
                  name="shiftEnd"
                  value={scheduleForm.shiftEnd}
                  onChange={handleScheduleInputChange}
                  required
                  disabled={!editingStaffId}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">
                Dias de trabajo
              </span>
              <input
                type="text"
                name="days"
                value={scheduleForm.days}
                onChange={handleScheduleInputChange}
                disabled={!editingStaffId}
                placeholder="Ej. Lun, Mar, Jue"
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              />
            </label>

            <div className="flex items-center gap-3 pt-4">
              <button
                type="submit"
                disabled={!editingStaffId}
                className="bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Guardar horario
              </button>
              {editingStaffId && (
                <button
                  type="button"
                  onClick={resetScheduleForm}
                  className="px-4 py-2 rounded-lg font-semibold border border-gray-300 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};
