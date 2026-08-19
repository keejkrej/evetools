import { withEve } from "eve/next";

const nextConfig = {
  output: "standalone",
} as const;

export default withEve(nextConfig, {
  eveRoot: "../tui",
});
