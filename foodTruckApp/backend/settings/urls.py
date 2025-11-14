"""
URL configuration for settings project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from core import views
from django.views.generic import RedirectView
from core.views import producto_detail, productos_list , sucursales_list, sucursal_detail, empresas_list, empresa_detail, categorias_list, categoria_detail, roles_list, rol_detail, usuarios_list, usuario_detail, producto_imagen, modificadores_list, modificador_detail, producto_modificadores

urlpatterns = [
    path('api/v1/auth/login/', views.login_api, name='api_login'),
    path('api/v1/auth/refresh/', views.refresh_api, name='api_refresh'),
    path('api/v1/auth/logout/', views.logout_api, name='api_logout'),
    path('api/v1/auth/me/', views.me_api, name='api_me'),
    path('api/v1/productos/<int:producto_id>/', producto_detail, name='producto_detail'),
    path("api/v1/productos/<int:producto_id>/imagen/", producto_imagen, name="producto-imagen"),
    path("api/v1/productos/", productos_list, name="productos-list"),
    path('api/v1/sucursales/', sucursales_list, name='sucursales_list'),
    path('api/v1/sucursales/<int:sucursal_id>/', sucursal_detail, name='sucursal_detail'),
    path('api/v1/empresas/', empresas_list, name='empresas_list'),
    path('api/v1/empresas/<int:empresa_id>/', empresa_detail, name='empresa_detail'),
    path('api/v1/categorias/', categorias_list, name='categorias_list'),
    path('api/v1/categorias/<int:categoria_id>/', categoria_detail, name='categoria_detail'),
    path('api/v1/roles/', roles_list, name='roles_list'),
    path('api/v1/roles/<int:rol_id>/', rol_detail, name='rol_detail'),
    path('api/v1/usuarios/', usuarios_list, name='usuarios_list'),
    path('api/v1/usuarios/<int:usuario_id>/', usuario_detail, name='usuario_detail'),
    path('api/v1/modificadores/', views.modificadores_list, name='modificadores_list'),
    path('api/v1/modificadores/<int:modificador_id>/', views.modificador_detail, name='modificador_detail'),
    path("api/v1/productos/<int:producto_id>/modificadores/", views.producto_modificadores, name="producto_modificadores"),
]
