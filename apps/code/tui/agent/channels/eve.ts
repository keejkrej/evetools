import { eveChannel } from "eve/channels/eve";
import { placeholderAuth, vercelOidc } from "eve/channels/auth";
import { guardedLocalDev } from "../lib/local-dev-auth.js";

export default eveChannel({
  auth: [vercelOidc(), guardedLocalDev(), placeholderAuth()],
});
