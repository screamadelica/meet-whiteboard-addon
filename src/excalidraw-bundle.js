import React from "react";
import ReactDOM from "react-dom/client";
import * as ExcalidrawLib from "@excalidraw/excalidraw";
import { Peer } from "peerjs";

// Assign to window explicitly before anything else runs
window.React = React;
window.ReactDOM = ReactDOM;
window.ExcalidrawLib = ExcalidrawLib;
window.Peer = Peer;