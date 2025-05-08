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

const template = jsonData;
// const context = {designTokens: {
//   primaryFont: {
//     value: 'ok'
//   },
//   primaryFontSize: {
//     value: 'ok'
//   },
//   textColor: {
//     value: 'ok'
//   }
// }}

const context = jsonData.resources;

const result = jsone(template, context);

console.log(JSON.stringify(result, null, 2));
