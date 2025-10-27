import Dexie from 'dexie';

export const db = new Dexie('foodTruckDB');

db.version(1).stores({
  productos: '&id, category',
  carrito: '&idItemCarrito',
});

db.version(2)
  .stores({
    productos_v2:
      '&producto_id, categoria_id, categoria_nombre, nombre, estado, fecha_creacion',
    categorias: '&categoria_id, nombre',
    carrito: '&idItemCarrito',
    outbox: '++id, method, endpoint, ts, status',
  })
  .upgrade(async (tx) => {
    const antiguos = await tx.table('productos').toArray();
    if (!antiguos?.length) return;

    const productosV2 = antiguos.map((p) => {
      const categoriaNombre = p.category || 'Sin categoría';
      const categoriaId = categoriaNombre
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');

      return {
        producto_id: String(p.id),
        categoria_id: categoriaId,
        categoria_nombre: categoriaNombre,
        nombre: p.name || '',
        descripcion: '',
        precio_base: Number(p.price || 0),
        tiempo_preparacion: 0,
        estado: true,
        fecha_creacion: new Date().toISOString(),
        image: p.image || null,
      };
    });

    await tx.table('productos_v2').bulkAdd(productosV2);

    const categoriasUnicas = [
      ...new Map(
        productosV2.map((prd) => [
          prd.categoria_id,
          { categoria_id: prd.categoria_id, nombre: prd.categoria_nombre },
        ])
      ).values(),
    ];
    if (categoriasUnicas.length) {
      await tx.table('categorias').bulkPut(categoriasUnicas);
    }
  });

db.version(3).stores({
  productos: null,
  productos_v2:
    '&producto_id, categoria_id, nombre, estado, fecha_creacion, [categoria_id+estado]',
  categorias: '&categoria_id, nombre',
  carrito: '&idItemCarrito',
  outbox: '++id, status, ts, method, endpoint',
});
