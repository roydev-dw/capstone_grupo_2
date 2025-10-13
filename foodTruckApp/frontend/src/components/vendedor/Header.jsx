import { Logo } from '../login/Logo';

export const Header = () => {
  return (
    <header className="flex items-center justify-between p-4 pb-2">
      <div className="w-full flex pl-8 justify-start ">
        <Logo alineacion={`justify-start`} />
      </div>
    </header>
  );
};
