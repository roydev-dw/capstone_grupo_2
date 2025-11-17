import Dexie from 'dexie';

const DB_NAME = 'puntoSaborDB';
const LEGACY_DB_NAMES = ['appDB', 'foodTruckDB'];
const MIGRATION_FLAG = 'puntoSaborDB:migrated:v1';

/**
 * Instancia principal de Dexie que define el esquema offline de Punto Sabor.
 *
 * @example
 * ```js
 * await db.products.toArray();
 * ```
 * @remarks Expone stores para productos, categorias, carrito y outbox.
 */
export const db = new Dexie(DB_NAME);

db.version(1).stores({
  products:
    '&id, producto_id, categoria_id, updatedAt, pending, [categoria_id+updatedAt]',
  categories: '&id, categoria_id, updatedAt, pending',
  carrito: '&idItemCarrito',
  outbox: '++key, type, op, status, ts, tempId, targetId',
});

db.version(2)
  .stores({
    products:
      '&id, producto_id, categoria_id, updatedAt, pendingFlag, [categoria_id+updatedAt]',
    categories: '&id, categoria_id, updatedAt, pendingFlag',
    carrito: '&idItemCarrito',
    outbox: '++key, type, op, status, ts, tempId, targetId',
  })
  .upgrade(async (tx) => {
    await tx
      .table('products')
      .toCollection()
      .modify((item) => {
        item.pending = !!item.pending;
        item.pendingFlag = item.pending ? 1 : 0;
      });
    await tx
      .table('categories')
      .toCollection()
      .modify((item) => {
        item.pending = !!item.pending;
        item.pendingFlag = item.pending ? 1 : 0;
      });
  });

db.version(3)
  .stores({
    products:
      '&id, producto_id, categoria_id, sucursal_id, updatedAt, pendingFlag, [sucursal_id+updatedAt], [categoria_id+updatedAt]',
    categories: '&id, categoria_id, sucursal_id, updatedAt, pendingFlag',
    carrito: '&idItemCarrito',
    outbox: '++key, type, op, status, ts, tempId, targetId',
  })
  .upgrade(async (tx) => {
    await tx
      .table('products')
      .toCollection()
      .modify((item) => {
        if (item.sucursal_id != null) {
          item.sucursal_id = Number(item.sucursal_id);
        } else if (item.sucursalId != null) {
          item.sucursal_id = Number(item.sucursalId);
        }
      });
    await tx
      .table('categories')
      .toCollection()
      .modify((item) => {
        if (item.sucursal_id != null) {
          item.sucursal_id = Number(item.sucursal_id);
        } else if (item.sucursalId != null) {
          item.sucursal_id = Number(item.sucursalId);
        }
      });
  });

/**
 * Indica si el navegador reporta conectividad disponible.
 *
 * @returns {boolean} `true` cuando `navigator.onLine` esta disponible o el entorno es SSR.
 * @example
 * ```js
 * if (isOnline()) await syncNow();
 * ```
 * @remarks En servidores o tests (sin `navigator`) asume `true` para evitar bloquear flujos.
 */
export const isOnline = () =>
  typeof navigator === 'undefined' ? true : navigator.onLine;

/**
 * Genera un identificador temporal legible para outbox/local-store.
 *
 * @param {string} [prefix='tmp'] Prefijo que identifica el tipo de entidad.
 * @returns {string} Cadena unica basada en random y timestamp.
 * @example
 * ```js
 * const tempId = generateTempId('product');
 * ```
 * @remarks Garantiza colisiones bajas sin depender de librerias externas.
 */
export const generateTempId = (prefix = 'tmp') =>
  `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const nowIso = () => new Date().toISOString();

async function migrateLegacyData() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  let migrated = false;

  for (const legacyName of LEGACY_DB_NAMES) {
    let exists = false;
    try {
      exists = await Dexie.exists(legacyName);
    } catch {
      exists = false;
    }
    if (!exists) continue;

    const legacy = new Dexie(legacyName);
    configureLegacySchema(legacy, legacyName);

    try {
      await legacy.open();
    } catch (err) {
      console.error(`[db] No se pudo abrir la BD legacy "${legacyName}":`, err);
      continue;
    }

    try {
      migrated = await migrateFromLegacyInstance(legacy, legacyName);
    } catch (err) {
      console.error(
        `[db] Error migrando datos desde "${legacyName}":`,
        err
      );
    } finally {
      try {
        legacy.close();
        await Dexie.delete(legacyName);
      } catch {}
    }

    if (migrated) break;
  }

  localStorage.setItem(MIGRATION_FLAG, '1');
}

function configureLegacySchema(legacy, name) {
  if (name === 'foodTruckDB') {
    legacy
      .version(1)
      .stores({ productos: '&id, category', carrito: '&idItemCarrito' });
    legacy
      .version(2)
      .stores({
        productos_v2:
          '&producto_id, categoria_id, categoria_nombre, nombre, estado, fecha_creacion',
        categorias: '&categoria_id, nombre',
        carrito: '&idItemCarrito',
        outbox: '++id, method, endpoint, ts, status',
      })
      .upgrade(() => {});
    legacy
      .version(3)
      .stores({
        productos: null,
        productos_v2:
          '&producto_id, categoria_id, nombre, estado, fecha_creacion, [categoria_id+estado]',
        categorias: '&categoria_id, nombre',
        carrito: '&idItemCarrito',
        outbox: '++id, status, ts, method, endpoint',
      });
  } else {
    legacy.version(1).stores({
      products:
        '&id, producto_id, categoria_id, updatedAt, pending, [categoria_id+updatedAt]',
      categories: '&id, categoria_id, updatedAt, pending',
      carrito: '&idItemCarrito',
      outbox: '++key, type, op, status, ts, tempId, targetId',
    });
    legacy
      .version(2)
      .stores({
        products:
          '&id, producto_id, categoria_id, updatedAt, pendingFlag, [categoria_id+updatedAt]',
        categories: '&id, categoria_id, updatedAt, pendingFlag',
        carrito: '&idItemCarrito',
        outbox: '++key, type, op, status, ts, tempId, targetId',
      })
      .upgrade(() => {});
  }
}

async function migrateFromLegacyInstance(legacy, name) {
  if (name === 'foodTruckDB') {
    const [legacyProducts, legacyCategories, legacyCart] = await Promise.all([
      legacy.table('productos_v2').toArray().catch(() => []),
      legacy.table('categorias').toArray().catch(() => []),
      legacy.table('carrito').toArray().catch(() => []),
    ]);

    const hasData =
      legacyProducts.length || legacyCategories.length || legacyCart.length;
    if (!hasData) return false;

    await db.transaction(
      'rw',
      db.products,
      db.categories,
      db.carrito,
      db.outbox,
      async () => {
        if (legacyProducts.length) {
          const migratedProducts = legacyProducts.map((item) => {
            const id = String(item.producto_id);
            return {
              id,
              producto_id: id,
              categoria_id: item.categoria_id ?? '',
              categoria_nombre: item.categoria_nombre ?? '',
              nombre: item.nombre ?? '',
              descripcion: item.descripcion ?? '',
              precio_base: Number(item.precio_base ?? 0),
              tiempo_preparacion: Number(item.tiempo_preparacion ?? 0),
              estado:
                item.estado === false || item.estado === 'Borrador'
                  ? false
                  : true,
              fecha_creacion: item.fecha_creacion ?? '',
              imagen_url: item.imagen_url ?? '',
              updatedAt: item.updatedAt ?? item.fecha_creacion ?? nowIso(),
              pending: !!item.pending,
              pendingFlag: item.pending ? 1 : 0,
              tempId: null,
              syncedAt: nowIso(),
              lastError: null,
              pendingOp: null,
              sucursal_id:
                item.sucursal_id != null ? Number(item.sucursal_id) : undefined,
            };
          });
          await db.products.bulkPut(migratedProducts);
        }

        if (legacyCategories.length) {
          const migratedCategories = legacyCategories.map((item) => {
            const id = String(item.categoria_id ?? item.id ?? '');
            return {
              id,
              categoria_id: id,
              nombre: item.nombre ?? '',
              descripcion: item.descripcion ?? '',
              estado: item.estado !== false,
              updatedAt: nowIso(),
              pending: !!item.pending,
              pendingFlag: item.pending ? 1 : 0,
              tempId: null,
              syncedAt: nowIso(),
              lastError: null,
              pendingOp: null,
              sucursal_id:
                item.sucursal_id != null ? Number(item.sucursal_id) : undefined,
            };
          });
          await db.categories.bulkPut(migratedCategories);
        }

        if (legacyCart.length) {
          await db.carrito.clear();
          await db.carrito.bulkPut(legacyCart);
        }

        await db.outbox.clear();
      }
    );

    return true;
  }

  const [legacyProducts, legacyCategories, legacyCart, legacyOutbox] =
    await Promise.all([
      legacy.table('products').toArray().catch(() => []),
      legacy.table('categories').toArray().catch(() => []),
      legacy.table('carrito').toArray().catch(() => []),
      legacy.table('outbox').toArray().catch(() => []),
    ]);

  const hasData =
    legacyProducts.length ||
    legacyCategories.length ||
    legacyCart.length ||
    legacyOutbox.length;
  if (!hasData) return false;

  await db.transaction(
    'rw',
    db.products,
    db.categories,
    db.carrito,
    db.outbox,
    async () => {
      if (legacyProducts.length) {
        const migratedProducts = legacyProducts.map(normalizeProductRecord);
        await db.products.bulkPut(migratedProducts);
      }

      if (legacyCategories.length) {
        const migratedCategories = legacyCategories.map(
          normalizeCategoryRecord
        );
        await db.categories.bulkPut(migratedCategories);
      }

      if (legacyCart.length) {
        await db.carrito.clear();
        await db.carrito.bulkPut(legacyCart);
      }

      if (legacyOutbox.length) {
        await db.outbox.clear();
        await db.outbox.bulkAdd(
          legacyOutbox.map((item) => ({
            ...item,
            status: item.status || 'pending',
            error: item.error ?? null,
            ts: item.ts ?? Date.now(),
          }))
        );
      }
    }
  );

  return true;
}

function normalizeProductRecord(raw) {
  const producto_id = String(
    raw.producto_id ?? raw.id ?? raw.tempId ?? `tmp-${Date.now()}`
  );
  const pending = !!raw.pending;
  const pendingFlag =
    typeof raw.pendingFlag === 'number'
      ? raw.pendingFlag
      : pending
      ? 1
      : 0;

  return {
    ...raw,
    id: producto_id,
    producto_id,
    categoria_id: raw.categoria_id ?? '',
    categoria_nombre: raw.categoria_nombre ?? '',
    nombre: raw.nombre ?? '',
    descripcion: raw.descripcion ?? '',
    precio_base: Number(raw.precio_base ?? 0),
    tiempo_preparacion: Number(raw.tiempo_preparacion ?? 0),
    estado:
      raw.estado === false || raw.estado === 'Borrador' ? false : !!raw.estado,
    fecha_creacion: raw.fecha_creacion ?? nowIso(),
    imagen_url: raw.imagen_url ?? '',
    updatedAt: raw.updatedAt ?? nowIso(),
    pending,
    pendingFlag,
    tempId: raw.tempId ?? null,
    syncedAt: raw.syncedAt ?? nowIso(),
    lastError: raw.lastError ?? null,
    pendingOp: raw.pendingOp ?? null,
    sucursal_id:
      raw.sucursal_id != null
        ? Number(raw.sucursal_id)
        : raw.sucursalId != null
        ? Number(raw.sucursalId)
        : undefined,
  };
}

function normalizeCategoryRecord(raw) {
  const categoria_id = String(raw.categoria_id ?? raw.id ?? '');
  const pending = !!raw.pending;
  const pendingFlag =
    typeof raw.pendingFlag === 'number'
      ? raw.pendingFlag
      : pending
      ? 1
      : 0;

  return {
    ...raw,
    id: categoria_id,
    categoria_id,
    nombre: raw.nombre ?? '',
    descripcion: raw.descripcion ?? '',
    estado: raw.estado !== false,
    updatedAt: raw.updatedAt ?? nowIso(),
    pending,
    pendingFlag,
    tempId: raw.tempId ?? null,
    syncedAt: raw.syncedAt ?? nowIso(),
    lastError: raw.lastError ?? null,
    pendingOp: raw.pendingOp ?? null,
    sucursal_id:
      raw.sucursal_id != null ? Number(raw.sucursal_id) : undefined,
  };
}

db.on('ready', () => {
  migrateLegacyData().catch((err) =>
    console.error('[db] Error en migracion legacy:', err)
  );
  normalizePendingFlags().catch((err) =>
    console.error('[db] Error normalizando flags pending:', err)
  );
});

/**
 * Promesa que se resuelve cuando Dexie abre la base o rechaza con el error encontrado.
 *
 * @returns {Promise<boolean>} `true` al completar la apertura.
 * @throws {Error} Si IndexedDB no esta disponible o Dexie no logra abrir.
 * @example
 * ```js
 * await dbReady;
 * ```
 * @remarks Permite gatear pantallas que dependen del cache offline antes de operar.
 */
export const dbReady = db
  .open()
  .catch((err) => {
    console.error('[db] No se pudo abrir IndexedDB', err);
    throw err;
  })
  .then(() => true);

async function normalizePendingFlags() {
  await db.transaction('rw', db.products, db.categories, async () => {
    const products = await db.products.toArray();
    const fixedProducts = products
      .filter(
        (item) =>
          typeof item.pendingFlag !== 'number' ||
          Number.isNaN(item.pendingFlag)
      )
      .map((item) => ({
        ...item,
        pending: !!item.pending,
        pendingFlag: item.pending ? 1 : 0,
      }));
    if (fixedProducts.length) {
      await db.products.bulkPut(fixedProducts);
    }

    const categories = await db.categories.toArray();
    const fixedCategories = categories
      .filter(
        (item) =>
          typeof item.pendingFlag !== 'number' ||
          Number.isNaN(item.pendingFlag)
      )
      .map((item) => ({
        ...item,
        pending: !!item.pending,
        pendingFlag: item.pending ? 1 : 0,
      }));
    if (fixedCategories.length) {
      await db.categories.bulkPut(fixedCategories);
    }
  });
}


