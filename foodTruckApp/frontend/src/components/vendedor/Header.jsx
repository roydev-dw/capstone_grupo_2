import { Logo } from '../login/Logo';

export const Header = ({ cartCount }) => {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 p-4 pb-2 backdrop-blur-sm dark:bg-background-dark/80">
      <div className="w-full flex pl-8 justify-start ">
        <Logo alineacion={`justify-start`} />
      </div>
    </header>
  );
};
