import { App } from "./app.js";
import "./styles/tokens.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("#app root missing");
}

const app = new App();
app.start(root).catch((err) => {
  console.error(err);
  root.innerHTML = `<p style="padding:2rem">Failed to start: ${String(err)}</p>`;
});
