
import jsone from 'json-e';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the YAML file
const yamlPath = path.join(__dirname, 'sample.yaml');
const yamlContent = fs.readFileSync(yamlPath, 'utf8');

// Convert YAML to JSON
const jsonData = yaml.load(yamlContent);


import Engine from "./engine.js";


const engine = new Engine();

const callback = (event, payload) => {
  console.log(event, payload);
}

engine.init(jsonData, callback);

engine.handleAction('nextStep', {});
