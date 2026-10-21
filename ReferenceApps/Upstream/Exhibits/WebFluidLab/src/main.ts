import "./style.css";
import { startApp } from "./app/App.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app root element");
}
void startApp(root);
