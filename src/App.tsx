import { Route } from "@solidjs/router";
import { SpreadsheetListPage } from "./pages/SpreadsheetListPage";
import { EditorPage } from "./pages/EditorPage";

export default function App() {
  return (
    <>
      <Route path="/" component={SpreadsheetListPage} />
      <Route path="/sheet/:id" component={EditorPage} />
    </>
  );
}
