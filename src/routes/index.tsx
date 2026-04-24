import { createFileRoute } from "@tanstack/react-router";
import GravitySimulator from "@/components/GravitySimulator";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Gravity / Spacetime Simulator" },
      {
        name: "description",
        content:
          "An interactive spacetime simulator. Create celestial bodies and watch them warp the fabric of space-time, orbit, collide, and escape.",
      },
      { property: "og:title", content: "Gravity / Spacetime Simulator" },
      {
        property: "og:description",
        content:
          "Press, hold, and flick to create celestial bodies and watch them warp space-time.",
      },
    ],
  }),
});

function Index() {
  return <GravitySimulator />;
}
