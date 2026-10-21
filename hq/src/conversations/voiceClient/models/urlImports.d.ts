// Vite's `?url` import: the served address of a file it emits. hq's tsconfig does not load `vite/client`.
declare module '*?url' {
  const url: string
  export default url
}
