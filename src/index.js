const core = require('@actions/core');
const { Octokit } = require('@octokit/core');
const { randomUUID } = require('crypto');
const fs = require('fs');
const wait = require('./wait');
require('dotenv').config();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN});


// most @actions toolkit packages have async methods
async function run() {
  let sbom = await buildSBOM(await getDependencyGraph());
  let fileName = writeFile(sbom, "spdx");
  core.setOutput("fileName", fileName);
}

// Writes the given contents to a file and returns the file name. 
async function writeFile(contents, name) {
  let filePath = `${process.env.GITHUB_WORKSPACE}/${name}-${randomUUID()}.json`
  //open a file called filePath and write contents to it
  fs.writeFile(filePath, contents, function(err) {
    if(err) {
      return console.log(err);
    }
    core.info("Wrote file to " + filePath);
  });

  return filePath;
}

// Builds a SPDX license file from the given dependency graph.
async function buildSBOM(dependencyGraph) {
  core.debug("Building SPDX file");
  let spdx = { 
    "spdxVersion": "SPDX-2.3",
    "SPDXID": "SPDXRef-DOCUMENT",
    "creationInfo": {
      "created": new Date(Date.now()).toISOString()
    },
    "packages": []
  };

  dependencyGraph?.repository?.dependencyGraphManifests?.nodes?.forEach(function (manifest){
    manifest?.dependencies?.nodes?.forEach(function(dependency) {
        let package = {
          "packageName" : dependency.packageName,
          "packageVersion": getPackageVersion(dependency.requirements),
          "purl": getPurl(dependency),
          "filesAnalyzed": "false"
        }
        spdx.packages.push(package);
    })
  });

  return JSON.stringify(spdx);
}

// Returns the PURL for the given dependency.
function getPurl(dependency) {
  let version = getPackageVersion(dependency.requirements);
  return `pkg:${dependency.packageManager}/${dependency.packageName}@${version}`;
}
// Returns the package version for the given requirements.
function getPackageVersion(version) {
  // requirements strings are formatted like '= 1.1.0'
  return version.match('= (.*)')[1];
}

// Returns the dependency graph for the repository.
async function getDependencyGraph() {
  core.debug("Getting repository dependency graph");
  var dependencyGraph = await octokit.graphql(`query($name: String!, $owner: String! ) { 
    repository (owner: $owner, name: $name) {
      dependencyGraphManifests {
        nodes {
            filename
            dependencies {
                nodes {
                    packageManager
                    packageName
                    requirements
                }
            }
        }
      }
    }
  }`, 
  {
    owner: process.env.GITHUB_REPOSITORY.split('/')[0],
    name: process.env.GITHUB_REPOSITORY.split('/')[1], 
    mediaType: {
      previews: ["hawkgirl"],
    }
  });

  return dependencyGraph;
}

run();
