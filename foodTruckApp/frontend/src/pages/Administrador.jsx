import { useMemo, useState } from 'react';
import { initialFoodTrucks } from '../utils/dataPrueba';

const defaultProductForm = {
  name: '',
  price: '',
  category: '',
  status: 'Disponible',
  stock: '',
};

const defaultStaffForm = {
  name: '',
  role: '',
  phone: '',
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

export const Administrador = () => {
  const [foodTrucks, setFoodTrucks] = useState(initialFoodTrucks);
  const [selectedFoodTruckId, setSelectedFoodTruckId] = useState(
    initialFoodTrucks[0]?.id ?? null
  );
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [staffForm, setStaffForm] = useState(defaultStaffForm);
  const [editingStaffId, setEditingStaffId] = useState(null);

  const selectedFoodTruck = useMemo(
    () => foodTrucks.find((truck) => truck.id === selectedFoodTruckId),
    [foodTrucks, selectedFoodTruckId]
  );

  const globalMetrics = useMemo(() => {
    const totalSales = foodTrucks.reduce(
      (acc, truck) => acc + truck.metrics.salesThisMonth,
      0
    );
    const totalProducts = foodTrucks.reduce(
      (acc, truck) => acc + truck.products.length,
      0
    );
    const totalStaff = foodTrucks.reduce(
      (acc, truck) => acc + truck.staff.length,
      0
    );
    const trucksInQueue = foodTrucks.filter(
      (truck) => truck.metrics.ordersInQueue > 0
    ).length;

    return {
      totalSales,
      totalProducts,
      totalStaff,
      trucksInQueue,
    };
  }, [foodTrucks]);

  const resetProductForm = () => {
    setProductForm(defaultProductForm);
    setEditingProductId(null);
  };

  const resetStaffForm = () => {
    setStaffForm(defaultStaffForm);
    setEditingStaffId(null);
  };

  const handleSelectFoodTruck = (foodTruckId) => {
    setSelectedFoodTruckId(foodTruckId);
    resetProductForm();
    resetStaffForm();
  };

  const handleProductInputChange = (event) => {
    const { name, value } = event.target;
    setProductForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStaffInputChange = (event) => {
    const { name, value } = event.target;
    setStaffForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const upsertFoodTruck = (updater) => {
    setFoodTrucks((prevFoodTrucks) =>
      prevFoodTrucks.map((truck) =>
        truck.id === selectedFoodTruckId ? updater(truck) : truck
      )
    );
  };

  const handleSubmitProduct = (event) => {
    event.preventDefault();
    if (!selectedFoodTruckId) return;

    const sanitizedProduct = {
      ...productForm,
      price: Number(productForm.price) || 0,
      stock: Number(productForm.stock) || 0,
      category: productForm.category.trim() || 'Sin categoria',
    };

    if (editingProductId) {
      upsertFoodTruck((truck) => {
        const updatedProducts = truck.products.map((product) =>
          product.id === editingProductId
            ? { ...product, ...sanitizedProduct }
            : product
        );
        const updatedCategories = Array.from(
          new Set(updatedProducts.map((product) => product.category))
        );
        return {
          ...truck,
          products: updatedProducts,
          categories: updatedCategories,
        };
      });
    } else {
      const newProduct = {
        id: `prd-${Date.now()}`,
        ...sanitizedProduct,
      };

      upsertFoodTruck((truck) => {
        const updatedProducts = [...truck.products, newProduct];
        const updatedCategories = Array.from(
          new Set(updatedProducts.map((product) => product.category))
        );
        return {
          ...truck,
          products: updatedProducts,
          categories: updatedCategories,
        };
      });
    }

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
    upsertFoodTruck((truck) => {
      const updatedProducts = truck.products.filter(
        (product) => product.id !== productId
      );
      const updatedCategories = Array.from(
        new Set(updatedProducts.map((product) => product.category))
      );
      return {
        ...truck,
        products: updatedProducts,
        categories: updatedCategories,
      };
    });

    if (editingProductId === productId) {
      resetProductForm();
    }
  };

  const handleSubmitStaff = (event) => {
    event.preventDefault();
    if (!selectedFoodTruckId) return;

    const normalizedDays = staffForm.days
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);

    const sanitizedStaff = {
      ...staffForm,
      days: normalizedDays,
    };

    if (editingStaffId) {
      upsertFoodTruck((truck) => ({
        ...truck,
        staff: truck.staff.map((member) =>
          member.id === editingStaffId
            ? { ...member, ...sanitizedStaff }
            : member
        ),
      }));
    } else {
      const newStaff = {
        id: `stf-${Date.now()}`,
        ...sanitizedStaff,
      };

      upsertFoodTruck((truck) => ({
        ...truck,
        staff: [...truck.staff, newStaff],
      }));
    }

    resetStaffForm();
  };

  const handleEditStaff = (staffMember) => {
    setEditingStaffId(staffMember.id);
    setStaffForm({
      name: staffMember.name,
      role: staffMember.role,
      phone: staffMember.phone,
      shiftStart: staffMember.shiftStart,
      shiftEnd: staffMember.shiftEnd,
      days: formatDays(staffMember.days),
    });
  };

  const handleDeleteStaff = (staffId) => {
    upsertFoodTruck((truck) => ({
      ...truck,
      staff: truck.staff.filter((member) => member.id !== staffId),
    }));

    if (editingStaffId === staffId) {
      resetStaffForm();
    }
  };
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-8">
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Panel de Administracion
            </h1>
            <p className="text-gray-600 mt-2">
              Gestiona tus foodtrucks, productos y equipos en un solo lugar.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full lg:w-auto">
            <div className={metricCardStyles}>
              <span className="text-sm text-gray-500 uppercase tracking-wide">
                Ventas acumuladas
              </span>
              <span className="text-xl font-bold text-gray-900">
                {formatCurrency(globalMetrics.totalSales)}
              </span>
            </div>
            <div className={metricCardStyles}>
              <span className="text-sm text-gray-500 uppercase tracking-wide">
                Productos activos
              </span>
              <span className="text-xl font-bold text-gray-900">
                {globalMetrics.totalProducts}
              </span>
            </div>
            <div className={metricCardStyles}>
              <span className="text-sm text-gray-500 uppercase tracking-wide">
                Colaboradores
              </span>
              <span className="text-xl font-bold text-gray-900">
                {globalMetrics.totalStaff}
              </span>
            </div>
            <div className={metricCardStyles}>
              <span className="text-sm text-gray-500 uppercase tracking-wide">
                Foodtrucks con pedidos
              </span>
              <span className="text-xl font-bold text-gray-900">
                {globalMetrics.trucksInQueue}
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <aside className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Foodtrucks</h2>
              <span className="text-sm text-gray-500">
                {foodTrucks.length} activos
              </span>
            </div>
            <div className="space-y-4">
              {foodTrucks.map((truck) => {
                const isSelected = truck.id === selectedFoodTruckId;
                return (
                  <button
                    key={truck.id}
                    onClick={() => handleSelectFoodTruck(truck.id)}
                    className={`w-full text-left rounded-xl border px-4 py-4 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-md'
                        : 'border-gray-200 hover:border-primary hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {truck.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {truck.location}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          truck.status === 'Operativo'
                            ? 'bg-green-100 text-green-700'
                            : truck.status === 'En Mantencion'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {truck.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Ultima sincronizacion: {truck.lastSync}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="lg:col-span-2 space-y-6">
            {selectedFoodTruck ? (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold text-gray-900">
                        {selectedFoodTruck.name}
                      </h2>
                      <p className="text-sm text-gray-500">
                        Ubicacion: {selectedFoodTruck.location}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full md:w-auto">
                      <div className={metricCardStyles}>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          Ventas mes
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {formatCurrency(
                            selectedFoodTruck.metrics.salesThisMonth
                          )}
                        </span>
                      </div>
                      <div className={metricCardStyles}>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          Pedidos en cola
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {selectedFoodTruck.metrics.ordersInQueue}
                        </span>
                      </div>
                      <div className={metricCardStyles}>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          Ticket promedio
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {formatCurrency(
                            selectedFoodTruck.metrics.averageTicket
                          )}
                        </span>
                      </div>
                      <div className={metricCardStyles}>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          Satisfaccion
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {selectedFoodTruck.metrics.satisfaction.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFoodTruck.categories.map((category) => (
                      <span
                        key={category}
                        className="text-xs font-medium px-3 py-1 rounded-full bg-purple-100 text-primary"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Productos
                      </h3>
                      <p className="text-sm text-gray-500">
                        Gestiona el catalogo disponible para este foodtruck.
                      </p>
                    </div>
                    <span className="text-sm text-gray-500">
                      {selectedFoodTruck.products.length} productos registrados
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
                        {selectedFoodTruck.products.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-sm text-gray-500"
                            >
                              Aun no registras productos para este foodtruck.
                            </td>
                          </tr>
                        ) : (
                          selectedFoodTruck.products.map((product) => (
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
                                  onClick={() =>
                                    handleDeleteProduct(product.id)
                                  }
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
                      <h4 className="text-lg font-semibold text-gray-900">
                        {editingProductId
                          ? 'Editar producto'
                          : 'Agregar nuevo producto'}
                      </h4>
                    </div>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Nombre
                      </span>
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
                      <span className="text-sm font-medium text-gray-700">
                        Precio
                      </span>
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
                      <span className="text-sm font-medium text-gray-700">
                        Estado
                      </span>
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
                        {editingProductId
                          ? 'Guardar cambios'
                          : 'Crear producto'}
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
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Equipo de trabajo
                      </h3>
                      <p className="text-sm text-gray-500">
                        Controla la disponibilidad y horarios de tus
                        colaboradores.
                      </p>
                    </div>
                    <span className="text-sm text-gray-500">
                      {selectedFoodTruck.staff.length} colaboradores
                    </span>
                  </div>

                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Nombre
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Rol
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Telefono
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Horario
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Dias
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedFoodTruck.staff.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-sm text-gray-500"
                            >
                              No hay colaboradores asignados a este foodtruck.
                            </td>
                          </tr>
                        ) : (
                          selectedFoodTruck.staff.map((member) => (
                            <tr key={member.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {member.name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {member.role}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {member.phone || 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {member.shiftStart} - {member.shiftEnd}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {formatDays(member.days)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right space-x-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditStaff(member)}
                                  className="text-primary font-semibold hover:underline"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStaff(member.id)}
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
                    onSubmit={handleSubmitStaff}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 pt-6"
                  >
                    <div className="col-span-1 md:col-span-2">
                      <h4 className="text-lg font-semibold text-gray-900">
                        {editingStaffId
                          ? 'Editar colaborador'
                          : 'Agregar colaborador'}
                      </h4>
                    </div>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Nombre
                      </span>
                      <input
                        type="text"
                        name="name"
                        value={staffForm.name}
                        onChange={handleStaffInputChange}
                        required
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Rol
                      </span>
                      <input
                        type="text"
                        name="role"
                        value={staffForm.role}
                        onChange={handleStaffInputChange}
                        required
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        Telefono
                      </span>
                      <input
                        type="tel"
                        name="phone"
                        value={staffForm.phone}
                        onChange={handleStaffInputChange}
                        placeholder="+56 9 0000 0000"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
                          value={staffForm.shiftStart}
                          onChange={handleStaffInputChange}
                          required
                          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </label>
                      <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-gray-700">
                          Salida
                        </span>
                        <input
                          type="time"
                          name="shiftEnd"
                          value={staffForm.shiftEnd}
                          onChange={handleStaffInputChange}
                          required
                          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
                        value={staffForm.days}
                        onChange={handleStaffInputChange}
                        placeholder="Ej. Lun, Mar, Mie"
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </label>

                    <div className="flex items-center gap-3 pt-4">
                      <button
                        type="submit"
                        className="bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                      >
                        {editingStaffId ? 'Guardar cambios' : 'Crear registro'}
                      </button>
                      {editingStaffId && (
                        <button
                          type="button"
                          onClick={resetStaffForm}
                          className="px-4 py-2 rounded-lg font-semibold border border-gray-300 hover:bg-gray-100 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
                Selecciona un foodtruck para revisar sus detalles.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
