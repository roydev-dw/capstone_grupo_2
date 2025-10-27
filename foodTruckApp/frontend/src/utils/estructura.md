productos

{
"ok": true,
"count": 4,
"page": 1,
"page_size": 20,
"results": [
{
"producto_id": 5,
"categoria_id": null,
"categoria_nombre": null,
"nombre": "Cafe",
"descripcion": "Cafe a granos",
"precio_base": "3000.00",
"tiempo_preparacion": 10,
"estado": true,
"fecha_creacion": "2025-10-18T16:35:01.342041+00:00"
},
{
"producto_id": 4,
"categoria_id": null,
"categoria_nombre": null,
"nombre": "Cafe",
"descripcion": "Cafe a granos",
"precio_base": "3000.00",
"tiempo_preparacion": 10,
"estado": true,
"fecha_creacion": "2025-10-18T16:34:45.791855+00:00"
},
{
"producto_id": 3,
"categoria_id": null,
"categoria_nombre": null,
"nombre": "TEST CAMBIO",
"descripcion": "TEST",
"precio_base": "2000.00",
"tiempo_preparacion": 5,
"estado": true,
"fecha_creacion": "2025-10-18T16:31:29.791796+00:00"
},
{
"producto_id": 2,
"categoria_id": null,
"categoria_nombre": null,
"nombre": "Hamburguesa",
"descripcion": "Hamburguesa con queso cheddar",
"precio_base": "2000.00",
"tiempo_preparacion": 5,
"estado": true,
"fecha_creacion": "2025-10-18T12:09:45.511903+00:00"
}
]
}

Categorias

{
"ok": true,
"count": 1,
"page": 1,
"page_size": 20,
"results": [
{
"categoria_id": 1,
"sucursal_id": 1,
"sucursal_nombre": "Sucursal Parque el Trapiche",
"nombre": "Hamburguesas",
"descripcion": "Clásicas y especialidad",
"estado": false,
"fecha_creacion": "2025-10-21T03:44:06.327201+00:00"
},
],
}

Empresa

{
"ok": true,
"count": 1,
"page": 1,
"page_size": 20,
"results": [
{
"empresa_id": 1,
"nombre": "FoodTruck El Trapiche",
"rut": "12.123.456-7",
"direccion": "Parque el Trapiche, Peñaflor",
"telefono": "+56 2 1122 3344",
"email": "contacto@foodtrucksapp.cl",
"estado": true,
"fecha_creacion": "2025-10-21T03:04:48.373647+00:00"
}
]
}

Sucursales

{
"ok": true,
"count": 1,
"page": 1,
"page_size": 20,
"results": [
{
"sucursal_id": 1,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"nombre": "Sucursal Parque el Trapiche",
"direccion": "Parque el Trapiche, Peñaflor",
"telefono": "229876543",
"estado": true,
"fecha_creacion": "2025-10-21T03:29:13.985701+00:00"
}
]
}

Roles

{
"ok": true,
"count": 3,
"page": 1,
"page_size": 20,
"results": [
{
"rol_id": 3,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"nombre": "Supervisor",
"descripcion": "Modificación de productos por sucursal",
"fecha_creacion": "2025-10-22T11:20:37.912177+00:00"
},
{
"rol_id": 2,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"nombre": "Vendedor",
"descripcion": "Rol para usuarios que gestionan ventas en el FoodTruck",
"fecha_creacion": "2025-10-11T00:22:28.366555+00:00"
},
{
"rol_id": 1,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"nombre": "Administrador",
"descripcion": "Acceso Completo al Sistema",
"fecha_creacion": "2025-10-09T00:00:00+00:00"
}
]
}

Usuarios

{
"ok": true,
"count": 3,
"page": 1,
"page_size": 20,
"results": [
{
"usuario_id": 4,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"sucursal_id": 1,
"sucursal_nombre": "Sucursal Parque el Trapiche",
"rol_id": 3,
"rol_nombre": "Supervisor",
"nombre_completo": "Supervisor",
"email": "supervisor@supervisor.cl",
"telefono": "+56 9 5555 5555",
"estado": true,
"fecha_creacion": "2025-10-22T11:29:30.099211+00:00"
},
{
"usuario_id": 3,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"sucursal_id": 1,
"sucursal_nombre": "Sucursal Parque el Trapiche",
"rol_id": 2,
"rol_nombre": "Vendedor",
"nombre_completo": "Vendedor",
"email": "vendedor@vendedor.cl",
"telefono": "950102417",
"estado": true,
"fecha_creacion": "2025-10-10T00:00:00+00:00"
},
{
"usuario_id": 1,
"empresa_id": 1,
"empresa_nombre": "FoodTruck El Trapiche",
"sucursal_id": 1,
"sucursal_nombre": "Sucursal Parque el Trapiche",
"rol_id": 1,
"rol_nombre": "Administrador",
"nombre_completo": "Administrador",
"email": "admin@admin.cl",
"telefono": "950102417",
"estado": true,
"fecha_creacion": "2025-10-09T00:00:00+00:00"
}
]
}
