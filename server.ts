import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs-extra";
import { glob } from "glob";
import { Octokit } from "octokit";
import dotenv from "dotenv";
import HTMLtoDOCX from "html-to-docx";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API Route for DOCX Generation
  app.post("/api/generate-docx", async (req, res) => {
    try {
      const { html } = req.body;
      if (!html) {
        return res.status(400).json({ error: "HTML content is required" });
      }

      const fileBuffer = await HTMLtoDOCX(html, null, {
        margins: {
          top: 1440,
          right: 1440,
          bottom: 1440,
          left: 1440,
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename="document.docx"');
      res.send(fileBuffer);
    } catch (error: any) {
      console.error("Error generating DOCX:", error);
      res.status(500).json({ error: error.message || "Failed to generate DOCX" });
    }
  });

  // API Route for GitHub Sync
  app.post("/api/github/sync", async (req, res) => {
    console.log("Received GitHub sync request...");
    const { pat, repo, branch, message } = req.body;

    if (!pat || !repo) {
      console.log("Error: Missing PAT or Repo");
      return res.status(400).json({ error: "GitHub PAT and Repo are required." });
    }

    try {
      const octokit = new Octokit({ auth: pat });
      const [owner, repoName] = repo.split("/");
      
      if (!owner || !repoName) {
        console.log("Error: Invalid repo format:", repo);
        return res.status(400).json({ error: "Invalid repository format. Use 'username/repo'." });
      }

      const targetBranch = branch || "main";
      const commitMessage = message || `Sync from GuruPintar AI at ${new Date().toISOString()}`;

      console.log(`Starting sync for ${owner}/${repoName} on branch ${targetBranch}`);

      // 1. Get all files in project (excluding node_modules, dist, etc.)
      console.log("Scanning files...");
      const files = await glob("**/*", {
        ignore: [
          "node_modules/**",
          "dist/**",
          ".git/**",
          ".next/**",
          "package-lock.json",
          "*.log",
          ".DS_Store",
          "node_modules",
          "dist"
        ],
        nodir: true,
        dot: true
      });

      console.log(`Found ${files.length} files to sync.`);

      if (files.length > 500) {
        console.log("Warning: Large number of files. This might take a while.");
      }

      // 2. Get the latest commit SHA of the branch
      console.log("Getting latest commit SHA...");
      let baseTreeSha: string | undefined;
      try {
        const { data: refData } = await octokit.rest.git.getRef({
          owner,
          repo: repoName,
          ref: `heads/${targetBranch}`,
        });
        const latestCommitSha = refData.object.sha;
        const { data: commitData } = await octokit.rest.git.getCommit({
          owner,
          repo: repoName,
          commit_sha: latestCommitSha,
        });
        baseTreeSha = commitData.tree.sha;
        console.log("Base tree SHA found:", baseTreeSha);
      } catch (e) {
        console.log("Branch might not exist or repo is empty. Starting fresh.");
      }

      // 3. Create blobs for each file
      console.log("Creating blobs...");
      const treeItems = await Promise.all(
        files.map(async (filePath) => {
          try {
            const content = await fs.readFile(filePath);
            const { data: blobData } = await octokit.rest.git.createBlob({
              owner,
              repo: repoName,
              content: content.toString("base64"),
              encoding: "base64",
            });
            return {
              path: filePath,
              mode: "100644" as const,
              type: "blob" as const,
              sha: blobData.sha,
            };
          } catch (err) {
            console.error(`Error creating blob for ${filePath}:`, err);
            throw err;
          }
        })
      );

      // 4. Create a new tree
      console.log("Creating new tree...");
      const { data: newTreeData } = await octokit.rest.git.createTree({
        owner,
        repo: repoName,
        tree: treeItems,
        base_tree: baseTreeSha,
      });

      // 5. Create a new commit
      console.log("Creating new commit...");
      const { data: newCommitData } = await octokit.rest.git.createCommit({
        owner,
        repo: repoName,
        message: commitMessage,
        tree: newTreeData.sha,
        parents: baseTreeSha ? [await (async () => {
          const { data: refData } = await octokit.rest.git.getRef({
            owner,
            repo: repoName,
            ref: `heads/${targetBranch}`,
          });
          return refData.object.sha;
        })()] : [],
      });

      // 6. Update the reference
      console.log("Updating reference...");
      if (baseTreeSha) {
        await octokit.rest.git.updateRef({
          owner,
          repo: repoName,
          ref: `heads/${targetBranch}`,
          sha: newCommitData.sha,
        });
      } else {
        await octokit.rest.git.createRef({
          owner,
          repo: repoName,
          ref: `refs/heads/${targetBranch}`,
          sha: newCommitData.sha,
        });
      }

      console.log("Sync complete!");
      res.json({ success: true, message: "Successfully synced to GitHub!", commit: newCommitData.sha });
    } catch (error: any) {
      console.error("GitHub Sync Error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to sync to GitHub",
        details: error.response?.data || {}
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
