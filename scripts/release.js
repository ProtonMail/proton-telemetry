const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Read the new version from package.json
const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
);
const newVersion = packageJson.version;

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
