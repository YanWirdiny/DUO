import Image from "next/image";
import Link from "next/link";
import avatar from "@/public/3D-image/3d-image-girl-afro.png";
import { cn } from "@/lib/utils";
import { HomeCard, HomeLabel, Trend } from "./HomeCard";

/** The buddy's 3D avatar with their score and this week's change, or a prompt to connect one. */
export function BuddyScoreCard({ buddy }: { buddy: { displayName: string; gymScore: number; weekChange: number } | null }) {
  return (
    <HomeCard className="flex flex-col gap-3 px-4 pb-[18px] pt-4">
      <HomeLabel>Buddy score</HomeLabel>
      <Image
        src={avatar}
        alt={buddy ? `${buddy.displayName}'s avatar` : ""}
        title={buddy?.displayName}
        width={126}
        height={126}
        className={cn("mx-auto size-[126px] object-cover", !buddy && "opacity-40 grayscale")}
      />
      {buddy ? (
        <p className="text-center text-[13px] text-ink">
          <span className="text-[15px] font-bold tabular-nums">{buddy.gymScore.toLocaleString()}</span>
          &nbsp;&nbsp;This week&nbsp;&nbsp;
          <Trend value={buddy.weekChange} />
        </p>
      ) : (
        <Link href="/info" className="text-center text-[13px] font-semibold text-brand hover:underline">
          Connect a buddy
        </Link>
      )}
    </HomeCard>
  );
}
