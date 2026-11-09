import Image from "next/image";

type UserAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
};

export default function UserAvatar({
  name,
  avatarUrl,
  className = "h-10 w-10",
  imageClassName = "h-full w-full",
}: UserAvatarProps) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-500/20 text-xs font-bold text-violet-200 ${className}`}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={`Foto de ${name}`}
          width={64}
          height={64}
          unoptimized
          className={`${imageClassName} object-cover`}
        />
      ) : (
        initials
      )}
    </div>
  );
}
