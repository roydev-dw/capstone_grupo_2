from django.db import models

class Empresa(models.Model):
    empresa_id = models.AutoField(primary_key=True, db_column='EmpresaId')
    nombre = models.CharField(max_length=100, db_column='Nombre')
    rut = models.CharField(max_length=12, unique=True, db_column='RUT')
    direccion = models.CharField(max_length=200, db_column='Direccion', blank=True, null=True)
    telefono = models.CharField(max_length=15, db_column='Telefono' , blank=True, null=True)
    email = models.EmailField(max_length=100, db_column='Email')
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')
    estado = models.BooleanField(default=True, db_column='Estado')

class Sucursal(models.Model):
    sucursal_id = models.AutoField(primary_key=True, db_column='SucursalId')
    empresa = models.ForeignKey('Empresa', on_delete=models.CASCADE, db_column='EmpresaId')
    nombre = models.CharField(max_length=100, db_column='Nombre')
    direccion = models.CharField(max_length=200, db_column='Direccion' , blank=True, null=True)
    telefono = models.CharField(max_length=15, db_column='Telefono', blank=True, null=True)
    estado = models.BooleanField(default=True, db_column='Estado')
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')

    class Meta:
        db_table = 'Sucursales'
        verbose_name = 'Sucursal'
        verbose_name_plural = 'Sucursales'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.nombre} - ({self.empresa.nombre})'
    
    
class Rol(models.Model):
    rol_id = models.AutoField(primary_key=True, db_column='RolId')
    empresa = models.ForeignKey('Empresa', on_delete=models.CASCADE, db_column='EmpresaId', null=True, blank=True)
    nombre = models.CharField(max_length=50, db_column='Nombre')
    descripcion = models.TextField(db_column='Descripcion', blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')

    class Meta:
        db_table = 'Roles'
        verbose_name = 'Rol'
        verbose_name_plural = 'Roles'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.nombre} - ({self.empresa.nombre})'

class Usuario(models.Model):
    usuario_id = models.AutoField(primary_key=True, db_column='UsuarioId')
    empresa = models.ForeignKey('Empresa', on_delete=models.CASCADE, db_column='EmpresaId', null=True, blank=True)
    rol = models.ForeignKey('Rol', on_delete=models.CASCADE, db_column='RolId')

    nombre_completo = models.CharField(max_length=100, db_column='Nombre')
    email = models.EmailField(max_length=100, unique=True, db_column='Email')
    contrasena_hash = models.CharField(max_length=128, db_column='ContrasenaHash')
    telefono = models.CharField(max_length=15, db_column='Telefono', blank=True, null=True)

    estado = models.BooleanField(default=True, db_column='Estado')
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')

    class Meta:
        db_table = 'Usuarios'
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.nombre_completo} - ({self.email})'

class UsuarioSucursal(models.Model):
    usuario_sucursal_id = models.AutoField(primary_key=True, db_column='UsuarioSucursalId')
    usuario = models.ForeignKey('Usuario', on_delete=models.CASCADE, db_column='UsuarioId')
    sucursal = models.ForeignKey('Sucursal', on_delete=models.CASCADE, db_column='SucursalId')

    fecha_asignacion = models.DateTimeField(db_column='FechaAsignacion', auto_now_add=True)
    estado = models.BooleanField(default=True, db_column='Estado')

    class Meta:
        managed = False  # 🔥 Importante: la tabla ya existe
        db_table = 'UsuariosSucursales'
        verbose_name = 'Usuario-Sucursal'
        verbose_name_plural = 'Usuarios-Sucursales'
        unique_together = (('usuario', 'sucursal'),)

    def __str__(self):
        activo = "Activo" if self.estado else "Inactivo"
        return f'{self.usuario.nombre_completo} ➜ {self.sucursal.nombre} ({activo})'

    
class Categoria(models.Model):
    categoria_id = models.AutoField(primary_key=True, db_column='CategoriaId')
    sucursal = models.ForeignKey('Sucursal', on_delete=models.CASCADE, db_column='SucursalId')
    nombre = models.CharField(max_length=100, db_column='Nombre')
    descripcion = models.CharField(max_length=200, db_column='Descripcion', blank=True, null=True)
    estado = models.BooleanField(default=True, db_column='Estado')
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')

    class Meta:
        db_table = 'Categorias'
        verbose_name = 'Categoria'
        verbose_name_plural = 'Categorias'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.nombre} - ({self.sucursal.nombre})'
    

class Modificador(models.Model):
    modificador_id = models.AutoField(primary_key=True, db_column='ModificadorId')
    empresa = models.ForeignKey('Empresa', on_delete=models.CASCADE, db_column='EmpresaId')
    nombre = models.CharField(max_length=100, db_column='Nombre')
    tipo = models.CharField(max_length=50, db_column='Tipo')
    valor_adicional = models.DecimalField(max_digits=10, decimal_places=2, db_column='ValorAdicional', default=0)
    estado = models.BooleanField(default=True, db_column='Estado')
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')

    class Meta:
        db_table = 'Modificadores'
        verbose_name = 'Modificador'
        verbose_name_plural = 'Modificadores'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.nombre} - ({self.tipo})'
    
class Producto(models.Model):
    producto_id = models.AutoField(primary_key=True, db_column='ProductoId')
    categoria = models.ForeignKey('Categoria', on_delete=models.SET_NULL, db_column='CategoriaId', null=True, blank=True)

    nombre = models.CharField(max_length=100, db_column='Nombre')  
    descripcion = models.CharField(max_length=200, db_column='Descripcion', blank=True, null=True)

    precio_base = models.DecimalField(max_digits=10, decimal_places=2, db_column='PrecioBase')
    tiempo_preparacion = models.IntegerField(db_column='TiempoPreparacion')  # minutos
    imagen_url = models.CharField(max_length=500, db_column='ImagenURL' , blank=True, null=True)
    estado = models.BooleanField(default=True, db_column='Estado')
    fecha_creacion = models.DateTimeField(auto_now_add=True, db_column='FechaCreacion')

    class Meta:
        db_table = 'PRODUCTOS'
        verbose_name = 'Producto'
        verbose_name_plural = 'Productos'
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f'{self.nombre} - {self.categoria.nombre}'


class ProductoModificador(models.Model):
    producto = models.ForeignKey('Producto', on_delete=models.CASCADE, db_column='ProductoId')
    modificador = models.ForeignKey('Modificador', on_delete=models.CASCADE, db_column='ModificadorId')
    es_obligatorio = models.BooleanField(default=False, db_column='EsObligatorio')

    class Meta:
        db_table = 'ProductoModificadores'
        verbose_name = 'Producto Modificador'
        verbose_name_plural = 'Producto Modificadores'
        unique_together = (('producto', 'modificador'),)

    def __str__(self):
        obligatorio = 'Obligatorio' if self.es_obligatorio else 'Opcional'
        return f'{self.producto.nombre} - {self.modificador.nombre} ({obligatorio})'
    

class ReglaNegocio(models.Model):
    regla_id = models.AutoField(primary_key=True, db_column='ReglaId')
    producto = models.ForeignKey('Producto', on_delete=models.CASCADE, db_column='ProductoId')
    condicion_modificador = models.ForeignKey(
        'Modificador', 
        on_delete=models.CASCADE, 
        related_name='reglas_condicion', 
        db_column='CondicionModificadorId'
    )
    accion_modificador = models.ForeignKey(
        'Modificador', 
        on_delete=models.CASCADE, 
        related_name='reglas_accion', 
        db_column='AccionModificadorId'
    )

    tipo_regla = models.CharField(max_length=20, db_column='TipoRegla')  
    descripcion = models.CharField(max_length=200, db_column='Descripcion', blank=True, null=True)

    class Meta:
        db_table = 'REGLASNEGOCIOS'
        verbose_name = 'Regla de Negocio'
        verbose_name_plural = 'Reglas de Negocio'

    def __str__(self):
        return f'Regla {self.tipo_regla} en {self.producto.nombre}'
    

class MetodoPago(models.Model):
    metodo_pago_id = models.AutoField(primary_key=True, db_column='MetodoPagoId')
    empresa = models.ForeignKey('Empresa', on_delete=models.CASCADE, db_column='EmpresaId')
    nombre = models.CharField(max_length=50, db_column='Nombre')
    tipo = models.CharField(max_length=20, db_column='Tipo') 
    estado = models.BooleanField(default=True, db_column='Estado')

    class Meta:
        db_table = 'METODOSPAGO'
        verbose_name = 'Método de Pago'
        verbose_name_plural = 'Métodos de Pago'

    def __str__(self):
        return f'{self.nombre} ({self.tipo})'
    

class Pedido(models.Model):
    pedido_id = models.AutoField(primary_key=True, db_column='PedidoId')
    sucursal = models.ForeignKey('Sucursal', on_delete=models.CASCADE, db_column='SucursalId')
    usuario = models.ForeignKey('Usuario', on_delete=models.CASCADE, db_column='UsuarioId')

    numero_pedido = models.CharField(max_length=20, db_column='NumeroPedido')
    fecha_hora = models.DateTimeField(auto_now_add=True, db_column='FechaHora')

    estado = models.CharField(max_length=20, db_column='Estado')     
    tipo_venta = models.CharField(max_length=20, db_column='TipoVenta') 
    es_offline = models.BooleanField(default=False, db_column='EsOffline')
    fecha_sincronizacion = models.DateTimeField(blank=True, null=True, db_column='FechaSincronizacion')

    total_bruto = models.DecimalField(max_digits=12, decimal_places=2, db_column='TotalBruto')
    descuento_total = models.DecimalField(max_digits=12, decimal_places=2, db_column='DescuentoTotal', default=0)
    iva = models.DecimalField(max_digits=12, decimal_places=2, db_column='IVA', default=0)
    total_neto = models.DecimalField(max_digits=12, decimal_places=2, db_column='TotalNeto')

    class Meta:
        db_table = 'PEDIDOS'
        verbose_name = 'Pedido'
        verbose_name_plural = 'Pedidos'
        ordering = ['-fecha_hora']

    def __str__(self):
        return f'Pedido #{self.numero_pedido} - {self.estado}'
    

class PedidoDetalle(models.Model):
    detalle_id = models.AutoField(primary_key=True, db_column='DetalleId')
    pedido = models.ForeignKey('Pedido', on_delete=models.CASCADE, db_column='PedidoId')
    producto = models.ForeignKey('Producto', on_delete=models.CASCADE, db_column='ProductoId')

    cantidad = models.IntegerField(db_column='Cantidad')
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2, db_column='PrecioUnitario')
    descuento = models.DecimalField(max_digits=10, decimal_places=2, db_column='Descuento', default=0)
    total_linea = models.DecimalField(max_digits=12, decimal_places=2, db_column='TotalLinea')

    notas = models.CharField(max_length=200, db_column='Notas', blank=True, null=True)

    class Meta:
        db_table = 'PEDIDODETALLES'
        verbose_name = 'Detalle de Pedido'
        verbose_name_plural = 'Detalles de Pedido'

    def __str__(self):
        return f'{self.cantidad} x {self.producto.nombre} (Pedido #{self.pedido.numero_pedido})'
    

class PedidoDetalleModificador(models.Model):
    detalle = models.ForeignKey('PedidoDetalle', on_delete=models.CASCADE, db_column='DetalleId')
    modificador = models.ForeignKey('Modificador', on_delete=models.CASCADE, db_column='ModificadorId')

    valor_aplicado = models.DecimalField(max_digits=10, decimal_places=2, db_column='ValorAplicado', default=0)
    es_gratuito = models.BooleanField(default=False, db_column='EsGratuito')

    class Meta:
        db_table = 'PEDIDODETALLEMODIFICADORES'
        verbose_name = 'Modificador de Detalle de Pedido'
        verbose_name_plural = 'Modificadores de Detalles de Pedido'
        unique_together = (('detalle', 'modificador'),)

    def __str__(self):
        gratuito = "Gratis" if self.es_gratuito else f"+{self.valor_aplicado}"
        return f'{self.modificador.nombre} en detalle #{self.detalle.detalle_id} ({gratuito})'
    

class Pago(models.Model):
    pago_id = models.AutoField(primary_key=True, db_column='PagoId')
    pedido = models.ForeignKey('Pedido', on_delete=models.CASCADE, db_column='PedidoId')
    metodo_pago = models.ForeignKey('MetodoPago', on_delete=models.CASCADE, db_column='MetodoPagoId')

    monto = models.DecimalField(max_digits=12, decimal_places=2, db_column='Monto')
    referencia = models.CharField(max_length=100, db_column='Referencia', blank=True, null=True)
    fecha_hora = models.DateTimeField(auto_now_add=True, db_column='FechaHora')
    pos_id = models.CharField(max_length=50, db_column='PosId', blank=True, null=True)

    class Meta:
        db_table = 'PAGOS'
        verbose_name = 'Pago'
        verbose_name_plural = 'Pagos'
        ordering = ['-fecha_hora']

    def __str__(self):
        return f'Pago {self.monto} por Pedido #{self.pedido.numero_pedido}'
    

class Boleta(models.Model):
    boleta_id = models.AutoField(primary_key=True, db_column='BoletaId')
    pedido = models.ForeignKey('Pedido', on_delete=models.CASCADE, db_column='PedidoId')

    folio = models.BigIntegerField(unique=True, db_column='Folio')
    fecha_emision = models.DateTimeField(auto_now_add=True, db_column='FechaEmision')

    rut_cliente = models.CharField(max_length=12, db_column='RUTCliente', blank=True, null=True)
    monto_total = models.DecimalField(max_digits=12, decimal_places=2, db_column='MontoTotal')

    codigo_qr = models.CharField(max_length=500, db_column='CodigoQR', blank=True, null=True)
    estado_envio_sii = models.CharField(max_length=20, db_column='EstadoEnvioSII', blank=True, null=True)

    xml_boleta = models.TextField(db_column='XMLBoleta', blank=True, null=True)
    url_pdf = models.CharField(max_length=300, db_column='URLPDF', blank=True, null=True)

    class Meta:
        db_table = 'BOLETAS'
        verbose_name = 'Boleta'
        verbose_name_plural = 'Boletas'
        ordering = ['-fecha_emision']

    def __str__(self):
        return f'Boleta Folio {self.folio} - Pedido #{self.pedido.numero_pedido}'
    

class CierreCaja(models.Model):
    cierre_id = models.AutoField(primary_key=True, db_column='CierreId')
    sucursal = models.ForeignKey('Sucursal', on_delete=models.CASCADE, db_column='SucursalId')
    usuario = models.ForeignKey('Usuario', on_delete=models.CASCADE, db_column='UsuarioId')

    fecha_apertura = models.DateTimeField(db_column='FechaApertura')
    fecha_cierre = models.DateTimeField(blank=True, null=True, db_column='FechaCierre')

    monto_inicial = models.DecimalField(max_digits=12, decimal_places=2, db_column='MontoInicial', default=0)
    ingresos_efectivo = models.DecimalField(max_digits=12, decimal_places=2, db_column='IngresosEfectivo', default=0)
    ingresos_electronicos = models.DecimalField(max_digits=12, decimal_places=2, db_column='IngresosElectronicos', default=0)

    total_esperado = models.DecimalField(max_digits=12, decimal_places=2, db_column='TotalEsperado', default=0)
    total_real = models.DecimalField(max_digits=12, decimal_places=2, db_column='TotalReal', default=0)
    diferencia = models.DecimalField(max_digits=12, decimal_places=2, db_column='Diferencia', default=0)

    estado = models.CharField(max_length=20, db_column='Estado')
    observaciones = models.CharField(max_length=300, db_column='Observaciones', blank=True, null=True)

    class Meta:
        db_table = 'CIERRESCAJA'
        verbose_name = 'Cierre de Caja'
        verbose_name_plural = 'Cierres de Caja'
        ordering = ['-fecha_apertura']

    def __str__(self):
        return f'Cierre #{self.cierre_id} - {self.sucursal.nombre}'
    

class Auditoria(models.Model):
    auditoria_id = models.AutoField(primary_key=True, db_column='AuditoriaId')
    usuario = models.ForeignKey('Usuario', on_delete=models.CASCADE, db_column='UsuarioId')
    sucursal = models.ForeignKey('Sucursal', on_delete=models.CASCADE, db_column='SucursalId')

    accion = models.CharField(max_length=50, db_column='Accion')       # Ej: CREAR, ACTUALIZAR, ELIMINAR
    entidad = models.CharField(max_length=50, db_column='Entidad', null=True)     # Nombre de la tabla/entidad afectada
    entidad_id = models.IntegerField(db_column='EntidadId', null=True)            # Id del registro afectado

    detalles = models.TextField(db_column='Detalles', blank=True, null=True)
    ip = models.CharField(max_length=45, db_column='IP', blank=True, null=True)  # IPv4 o IPv6
    fecha_hora = models.DateTimeField(auto_now_add=True, db_column='FechaHora')

    class Meta:
        db_table = 'AUDITORIA'
        verbose_name = 'Auditoría'
        verbose_name_plural = 'Auditorías'
        ordering = ['-fecha_hora']

    def __str__(self):
        return f'Auditoría {self.accion} en {self.entidad} (ID {self.entidad_id})' 


class TransaccionWebpay(models.Model):
    transaccion_id = models.AutoField(primary_key=True)
    pedido = models.ForeignKey('Pedido', on_delete=models.CASCADE)
    token = models.CharField(max_length=200)
    buy_order = models.CharField(max_length=100)
    session_id = models.CharField(max_length=100)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    estado = models.CharField(max_length=20, default="pendiente")  # pendiente, autorizado, rechazado
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "TransaccionesWebpay"