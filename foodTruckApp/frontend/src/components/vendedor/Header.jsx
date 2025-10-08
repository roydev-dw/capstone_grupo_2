export const Header = ({ cartCount }) => {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 p-4 pb-2 backdrop-blur-sm dark:bg-background-dark/80">
      <div className="w-12"></div>
      <h1 className="flex-1 text-center text-xl font-semibold">Punto Sabor</h1>
      <div className="flex w-12 items-center justify-end"></div>
    </header>
  );
};
