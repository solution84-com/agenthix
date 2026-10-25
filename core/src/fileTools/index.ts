/**
 * `@agenthix/core/file-tools`: reading and changing files over a folder a tool is given, opening each file first and
 * checking it is the file that was allowed. Shared by the OpenCode plugin's file tools and the knowledge tools. Kept off
 * the root entry, because it is Node-only and the root entry reaches browsers.
 */
export * from './verifiedFs.js'
export * from './textFile.js'
export * from './systemFdPaths.js'
export * from './refusals.js'
export * from './paths.js'
export * from './read.js'
export * from './edit.js'
export * from './write.js'
export * from './grep.js'
export * from './grepArgs.js'
export * from './grepGuards.js'
export * from './grepOutput.js'
