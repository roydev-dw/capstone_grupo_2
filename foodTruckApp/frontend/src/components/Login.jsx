export const Login = () => {
  return (
    <>
      <main>
        <section className="w-full h-screen flex flex-col justify-center items-center bg-gradient-to-r from-[#434343] to-black">
          <div className="">
            <h1 className="text-white">Login Sistema Food Truck</h1>
          </div>
          <form action="" className="bg-white flex flex-col gap-3 p-5 rounded">
            <label for="email">Ingresa tu email.</label>
            <input type="email" id="email" name="email" required />

            <label for="contrasena">Ingresa tu contraseña</label>
            <input type="password" id="contrasena" name="contrasena" required />
          </form>
        </section>
      </main>
    </>
  );
};
