import { Header } from '../components/vendedor/Header';
import { BarraBusqueda } from '../components/vendedor/BarraBusqueda';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';

const products = [
  {
    id: 1,
    name: 'Hamburguesa Clásica',
    price: 8.99,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuB40lKfRlfruOa0VvlB_T5Y7Opa5qc6_jeN7lEFq3zelfouYgyYRoUEor0gURJHPhFRrfX5IBGtcU17RGlXkz2Bk2DBPUmvRdJFPFz9i7WrCJocStgSbkeGdPkZPqL2zxqijy5YAA3WfnBDebAwYsmokpKxltVKRWa6ySvknsbFsbromptBkg7NcOgEM1QEJ2Uey6-9bucfndEFu5ojOT8sEw1as5Gl8H9cSknd_RMIhqUaE9kyL3V1KuUrxm5J_TUXTX9oxC7rGIDB',
  },
  {
    id: 2,
    name: 'Refresco de Cola',
    price: 1.5,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAYFJAQVIZRAs1ZsOXtO-4nci6uuaOsM4bf9OySmHmPtttmTvget0HtWdMa5s1DMR7egFWFaieCZVUs1eTqhmrsWjT3e10Sr_Q1kY-CC4shqliR2mOvfy_aOxCfRXoQsrIC64pr40_qCuwwDnYCP306z-IAb5XUOcPUo0Hhosbw6qKPoI7tpn-iyyUf6aE0b3E_XnzKbb4w-dUjCTucd-QGYWXX6SOlUGjlkmt73kE8QuzzGn5KydjHyFf1F4CyK62dQmKffpbNmwIS',
  },
  {
    id: 3,
    name: 'Papas Fritas',
    price: 3.0,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDLdnzDDCsufIKjBJuDfF7ilxkfvnnOlkY8yd7gziFEQCwysXqx7IgJoeLweb7uBj76Vvzozij3CkxJ38ax4gRzJmQj1E0HwsqyvHcQeyAR1Wk8kx3Uf_Nv8zjjc9PbBInWGJeVoeEOoZKby6TNvrRlfG6DeMLTzI09poU3aHCUSP-tWR-y_DFAmv20yS78ZtkL15iWcJ2NAVk1RLqXb_WztHN3nOm3b4CHzG9i8zUxlxbnn69eDX9lVyDDLkrKLKbZTttIHhSdvLjV',
  },
  {
    id: 4,
    name: 'Tarta de Chocolate',
    price: 4.5,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDs54a8V2crQzgOzq4qd1422h77QC0CsOJIB3b5vQcNR3QbikSRq9BKIH8E3HXvlmtFE-gI71WctjpGHu4FU_NysJp-tOLLqPAUyHnjG4O_2-yBaEQMVmxhBF7EmQqHYI-P4ZEwfRkuKPcYyHQrVddaHjMTACTaSzQZX9-saFI87kJNUa7sUGKk_YwF6jCWUlIh1kaXRKrwjYSgwoOSjJHF2tSmezYs6VWBpOHg9PwJiVuERR4HSJkF1w-5VDDzjvCB_5GPlJgVvFXz',
  },
];

export const Vendedor = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark font-display">
      <Header cartCount={3} />
      <main className="flex-1 p-4">
        <BarraBusqueda />
        <FiltroCategoria />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {products.map((p) => (
            <TarjetaProducto key={p.id} product={p} />
          ))}
        </div>
      </main>
      <BotonTarjeta cartCount={3} />
    </div>
  );
};
