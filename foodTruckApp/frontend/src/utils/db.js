import Dexie from 'dexie';

export const db = new Dexie('foodTruckDB');

db.version(1).stores({
  productos: '&id, category',
  carrito: '&idItemCarrito',
});

/*
Explicación de los índices:
- '&id': Es la clave primaria (primary key) y debe ser única.
- '++id': Sería una clave primaria auto-incremental (1, 2, 3...).
- 'idItemCarrito': Un índice normal para poder buscar rápido.
- '&idItemCarrito': Clave primaria única (perfecto para nuestro caso).
*/
