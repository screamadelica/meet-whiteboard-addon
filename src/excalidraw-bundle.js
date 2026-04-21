import React from "react";
import ReactDOM from "react-dom/client";
import * as ExcalidrawLib from "@excalidraw/excalidraw";
import { Peer } from "peerjs";

// Must be assigned to globalThis, not just window, for IIFE scope
globalThis.process = { env: { NODE_ENV: "production" } };
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
globalThis.ExcalidrawLib = ExcalidrawLib;
globalThis.Peer = Peer;