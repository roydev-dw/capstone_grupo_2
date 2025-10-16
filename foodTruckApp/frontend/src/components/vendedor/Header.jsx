import { Logo } from '../login/Logo';

export const Header = () => {
  return (
    <header className="fixed lg:relative top-0 left-0 right-0 z-10 bg-white/60 backdrop-blur-sm lg:bg-transparent flex items-center justify-between p-4 pb-2 shadow-xl shadow-black/50 lg:shadow-none rounded-bl-4xl rounded-br-4xl lg:rounded-none">
      <div className="w-full flex pl-8 justify-start ">
        <Logo alineacion={`justify-start`} />
      </div>
    </header>
  );
};
