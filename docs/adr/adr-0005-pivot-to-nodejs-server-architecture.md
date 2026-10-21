---
created: 2026-04-27
description: Pivoting the core from a Flutter-first implementation to a Node.js server-oriented architecture.
---

# Architecture Decision Record: Pivot to Node.js Server Architecture

**Status:** Accepted

Left as *Proposed* long after the pivot was enacted; the platform app has run on Node.js (Wasp) since, so this record documents a decision already fully carried out.

## Context

The initial implementation of Agenthix utilized Flutter as the primary framework for both the desktop client and core agent orchestration. While Flutter provided a unified codebase for cross-platform desktop development, several challenges emerged:

1.  **Deployment Limitations:** A Flutter-centric architecture is primarily designed for local execution on personal computers. This restricts the ability to run the solution in server-side environments, high-availability cloud clusters, or as a centralized service accessible from any device.
2.  **AI Development Velocity:** We observed that AI agents (including LLM-based coding assistants) demonstrate significantly higher proficiency and lower error rates when working with the Node.js/TypeScript ecosystem compared to Dart/Flutter. The denser training data for JavaScript/TypeScript allows for faster iteration and more reliable code generation.
3.  **Prototyping & Portability:** Our current web-based prototypes are built using React and Node.js. Transitioning the core architecture to Node.js allows for direct portability of these prototype components into the final production web application, reducing implementation redundancy.
4.  **Open Source Alignment:** Other successful agentic frameworks, such as OpenClaw, utilize a server-oriented Node.js architecture, suggesting a more scalable path for server-side coordination and multi-client access.

## Decision

We will pivot the core Agenthix architecture from a Flutter-first implementation to a **Node.js Server-Oriented Architecture**.

1.  **Core Orchestration Layer:** The primary agent execution, session management, and workspace logic will be rewritten in Node.js/TypeScript.
2.  **Web-First Interface:** The primary user interface will transition from Flutter to a React-based web application (leveraging the work already done in the prototype).
3.  **Cross-Platform Delivery:** To maintain a desktop presence, we will utilize Electron or similar technologies to wrap the web application for desktop use, while the core "Site" execution can run on any server capable of hosting Node.js.
4.  **Consolidated Stack:** This move aligns the implementation stack across the prototype and production environments, enabling faster feature parity and simpler deployment workflows.

## Proposed Strategy

### 1. Unified TypeScript Stack
Both the frontend (React) and backend (Node.js) will share TypeScript models and logic where applicable, ensuring type safety across the entire platform.

### 2. Server-Centric Execution
The execution logic that previously lived within the Flutter desktop app will be extracted into a standalone Node.js "Site" service. This service can be deployed on a VPS, a local machine, or a cloud provider.

### 3. Component Porting
UI components developed in the prototypes will serve as the foundation for the production React app, bypassing the need to maintain an equivalent Flutter UI.

## Benefits

-   **Universality:** The solution can now be run anywhere (Local, VPS, Cloud, Docker).
-   **AI Synergy:** Leveraging the AI's strength in JavaScript/TypeScript significantly accelerates development and testing.
-   **Faster Time-to-Market:** Directly reusing prototype components eliminates the "rewrite" phase between research and production.
-   **Easier Maintenance:** A single language (TypeScript) across the stack reduces cognitive load and simplifies CI/CD.

## Tradeoffs

-   **Technical Debt:** Existing Flutter/Dart code will need to be decommissioned or ported.
-   **Memory Overhead:** A Node.js/Web-based stack typically has a higher memory footprint on the desktop compared to a native Flutter implementation.
-   **Native Integration:** Some deep OS integrations available in Flutter might require more effort in an Electron/Web context.

## Future Direction

-   Migrate the existing core logic to a Node.js-based core package.
-   Establish a formal transition plan for existing Flutter features.
-   Refine the deployment model for Node.js "Sites" (e.g., Docker Compose files, simple NPM scripts).
