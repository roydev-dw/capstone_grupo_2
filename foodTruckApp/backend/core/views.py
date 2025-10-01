from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required

def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect("home")
        else:
            return render(request, "login/login.html", {"error": "Usuario o contraseña inválidos"})
    return render(request, "login/login.html")


@login_required
def home_view(request):
    return render(request, "base/home.html", {"user": request.user})


def logout_view(request):
    logout(request)
    return redirect("login")