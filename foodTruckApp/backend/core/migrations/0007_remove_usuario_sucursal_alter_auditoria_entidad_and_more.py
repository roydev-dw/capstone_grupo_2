from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_usuariosucursal_remove_usuario_sucursal_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='auditoria',
            name='entidad',
            field=models.CharField(db_column='Entidad', max_length=50, null=True),
        ),
        migrations.AlterField(
            model_name='auditoria',
            name='entidad_id',
            field=models.IntegerField(db_column='EntidadId', null=True),
        ),
    ]