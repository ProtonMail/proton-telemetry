const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const PACKAGE_JSON_PATH = path.resolve(__dirname, '..', 'package.json');

const normalizedPackagePath = path.normalize(PACKAGE_JSON_PATH);
const normalizedBaseDir = path.normalize(process.cwd());

if (!normalizedPackagePath.startsWith(normalizedBaseDir)) {
    throw new Error(
        'Invalid path: attempting to access file outside of project directory',
    );
}

// nosemgrep: gitlab.eslint.detect-non-literal-fs-filename
const packageJson = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
const newVersion = JSON.parse(packageJson).version;

try {
    // Stage the package.json changes
    execSync('git add package.json');

    // Create a temporary commit with the version bump
    execSync(`git commit -m "chore: release v${newVersion}"`);

    // Create and push the tag
    execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
    execSync('git push origin HEAD --tags');

    console.log(`Successfully released version ${newVersion}`);
} catch (error) {
    console.error('Error during release:', error.message);
    process.exit(1);
}
