import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { ProductsPage } from "./pages/ProductsPage" with { type: "ref" };
import { ProductDetailPage } from "./pages/ProductDetailPage" with { type: "ref" };
import { ProgramsPage } from "./pages/ProgramsPage" with { type: "ref" };
import { ProgramDetailPage } from "./pages/ProgramDetailPage" with { type: "ref" };
import { getProducts, getProduct, getProductBySlug, getPrograms, getProgram, getProgramBySlug } from "./queries" with { type: "ref" };
import { createProduct, updateProduct, deleteProduct, createProgram, updateProgram, deleteProgram } from "./actions" with { type: "ref" };

export const productsSpec: Spec = [
    route("ProductsRoute", "/products", page(ProductsPage, { authRequired: true })),
    route("ProductDetailRoute", "/products/:slug", page(ProductDetailPage, { authRequired: true })),
    route("ProgramsRoute", "/programs", page(ProgramsPage, { authRequired: true })),
    route("ProgramDetailRoute", "/programs/:slug", page(ProgramDetailPage, { authRequired: true })),
    query(getProducts, { entities: ["Product"] }),
    query(getProduct, { entities: ["Product", "Project", "Task"] }),
    query(getProductBySlug, { entities: ["Product", "Project", "Task"] }),
    query(getPrograms, { entities: ["Program"] }),
    query(getProgram, { entities: ["Program", "Project"] }),
    query(getProgramBySlug, { entities: ["Program", "Project"] }),
    action(createProduct, { entities: ["Product"] }),
    action(updateProduct, { entities: ["Product"] }),
    action(deleteProduct, { entities: ["Product", "Project"] }),
    action(createProgram, { entities: ["Program"] }),
    action(updateProgram, { entities: ["Program"] }),
    action(deleteProgram, { entities: ["Program", "Project"] }),
];
