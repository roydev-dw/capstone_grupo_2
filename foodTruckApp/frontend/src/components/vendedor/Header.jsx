export const Header = ({ cartCount }) => {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 p-4 pb-2 backdrop-blur-sm dark:bg-background-dark/80">
      <div className="w-12"></div>
      <h1 className="flex-1 text-center text-xl font-bold tracking-tight text-black dark:text-white">
        Punto Sabor
      </h1>
      <div className="flex w-12 items-center justify-end">
        <button className="relative flex h-12 w-12 items-center justify-center rounded-full text-black dark:text-white">
          <span className="material-symbols-outlined text-3xl">
            shopping_cart
          </span>
          {cartCount > 0 && (
            <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-black">
              {cartCount}
            </div>
          )}
        </button>
      </div>
    </header>
  );
};
