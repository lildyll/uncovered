type UncoveredLogoProps = {
  className?: string;
};

export default function UncoveredLogo({
  className = "",
}: UncoveredLogoProps) {
  return (
    <h1
      className={`flex items-baseline justify-center whitespace-nowrap
        text-[clamp(2.5rem,16vw,7rem)]
        font-black tracking-[-0.03em] leading-none text-white
        ${className}`}
    >
      <span className="relative top-[0.19em] drop-shadow-[0_0.1em_0_#316BF3]">
        U
      </span>

      <span className="drop-shadow-[0_0.1em_0_#316BF3]">
        ncovered
      </span>
    </h1>
  );
}