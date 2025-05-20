document.addEventListener('DOMContentLoaded', () => {
    const projectSelect = document.getElementById('project-select');
    const refreshButton = document.getElementById('refresh-button');
    const projectDetailsContainer = document.getElementById('project-details-container');
    const detailsContent = document.getElementById('details-content');
    const tasksContainer = document.getElementById('tasks-container');
    const tasksContent = document.getElementById('tasks-content');
    const knowledgeContainer = document.getElementById('knowledge-container');
    const knowledgeContent = document.getElementById('knowledge-content');
    const errorMessageDiv = document.getElementById('error-message');
    const neo4jStatusSpan = document.getElementById('neo4j-status');
    const themeCheckbox = document.getElementById('theme-checkbox');

    let driver;

    const NEO4J_URI = "bolt://localhost:7687";
    const NEO4J_USER = "neo4j";
    const NEO4J_PASSWORD = "password2";

    // --- Theme Management ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark-mode');
            themeCheckbox.checked = true;
        } else {
            document.documentElement.classList.remove('dark-mode');
            themeCheckbox.checked = false;
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.classList.contains('dark-mode') ? 'light' : 'dark';
        applyTheme(currentTheme);
        localStorage.setItem('atlasTheme', currentTheme);
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem('atlasTheme') || 'light'; // Default to light
        applyTheme(savedTheme);
    }

    themeCheckbox.addEventListener('change', toggleTheme);
    loadTheme(); // Apply saved theme on initial load
    // --- End Theme Management ---

    function setDisplay(element, show) {
        if (show) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    }

    async function connectToNeo4j() {
        errorMessageDiv.textContent = '';
        setDisplay(errorMessageDiv, false);
        
        neo4jStatusSpan.textContent = 'Connecting...';
        neo4jStatusSpan.style.color = 'var(--warning-color)';

        try {
            if (typeof neo4j === 'undefined') {
                throw new Error('Neo4j driver not loaded. Check CDN link in index.html.');
            }
            driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
            await driver.verifyConnectivity();
            neo4jStatusSpan.textContent = 'Connected';
            neo4jStatusSpan.style.color = 'var(--success-color)';
            console.log('Successfully connected to Neo4j.');
            return true;
        } catch (error) {
            console.error('Neo4j Connection Error:', error);
            errorMessageDiv.textContent = `Neo4j Connection Error: ${error.message}. Check console and credentials.`;
            setDisplay(errorMessageDiv, true);
            neo4jStatusSpan.textContent = `Error`;
            neo4jStatusSpan.style.color = 'var(--error-color)';
            projectSelect.innerHTML = '<option value="">Neo4j Connection Error</option>';
            return false;
        }
    }

    async function runQuery(query, params = {}) {
        if (!driver) {
            errorMessageDiv.textContent = 'Not connected to Neo4j.';
            setDisplay(errorMessageDiv, true);
            throw new Error('Not connected to Neo4j.');
        }
        const session = driver.session();
        try {
            const result = await session.run(query, params);
            return result.records.map(record => {
                const obj = {};
                record.keys.forEach(key => {
                    const value = record.get(key);
                    if (neo4j.isInt(value)) {
                        obj[key] = value.toNumber();
                    } else if (typeof value === 'object' && value !== null && value.properties) {
                        const nodeProps = {};
                        Object.keys(value.properties).forEach(propKey => {
                            const propValue = value.properties[propKey];
                            nodeProps[propKey] = neo4j.isInt(propValue) ? propValue.toNumber() : propValue;
                        });
                        obj[key] = nodeProps;
                    } else {
                        obj[key] = value;
                    }
                });
                return obj;
            });
        } finally {
            await session.close();
        }
    }

    async function fetchProjects() {
        projectSelect.innerHTML = '<option value="">Loading projects...</option>';
        setDisplay(projectDetailsContainer, false);
        setDisplay(tasksContainer, false);
        setDisplay(knowledgeContainer, false);
        errorMessageDiv.textContent = '';
        setDisplay(errorMessageDiv, false);

        if (!driver) {
            const connected = await connectToNeo4j();
            if (!connected) return;
        }
        
        try {
            const projects = await runQuery('MATCH (p:Project) RETURN p ORDER BY p.name');
            
            projectSelect.innerHTML = '<option value="">-- Select a Project --</option>';
            if (projects && projects.length > 0) {
                projects.forEach(record => {
                    const project = record.p;
                    const option = document.createElement('option');
                    option.value = project.id;
                    option.textContent = project.name;
                    projectSelect.appendChild(option);
                });
            } else {
                projectSelect.innerHTML = '<option value="">No projects found</option>';
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error);
            projectSelect.innerHTML = '<option value="">Error loading projects</option>';
            errorMessageDiv.textContent = `Error loading projects: ${error.message}`;
            setDisplay(errorMessageDiv, true);
        }
    }

    async function fetchProjectDetails(projectId) {
        if (!projectId) {
            setDisplay(projectDetailsContainer, false);
            setDisplay(tasksContainer, false);
            setDisplay(knowledgeContainer, false);
            return;
        }

        detailsContent.innerHTML = '<p class="loading">Loading project details...</p>';
        tasksContent.innerHTML = '<p class="loading">Loading tasks...</p>';
        knowledgeContent.innerHTML = '<p class="loading">Loading knowledge...</p>';
        setDisplay(projectDetailsContainer, true);
        setDisplay(tasksContainer, true);
        setDisplay(knowledgeContainer, true);
        errorMessageDiv.textContent = '';
        setDisplay(errorMessageDiv, false);

        try {
            const projectResult = await runQuery('MATCH (p:Project {id: $projectId}) RETURN p', { projectId });
            const project = projectResult.length > 0 ? projectResult[0].p : null;
            renderProjectDetails(project);

            const tasksResult = await runQuery(
                'MATCH (p:Project {id: $projectId})-[:CONTAINS_TASK]->(t:Task) RETURN t ORDER BY t.title', 
                { projectId }
            );
            const tasks = tasksResult.map(r => r.t);
            renderTasks(tasks);

            const knowledgeResult = await runQuery(
                'MATCH (p:Project {id: $projectId})-[:CONTAINS_KNOWLEDGE]->(k:Knowledge) RETURN k ORDER BY k.createdAt DESC', 
                { projectId }
            );
            const knowledgeItems = knowledgeResult.map(r => r.k);
            renderKnowledge(knowledgeItems);

        } catch (error) {
            console.error(`Failed to fetch details for project ${projectId}:`, error);
            errorMessageDiv.textContent = `Error loading project data: ${error.message}`;
            setDisplay(errorMessageDiv, true);
            detailsContent.innerHTML = `<p class="error">Error loading project details: ${error.message}</p>`;
            tasksContent.innerHTML = `<p class="error">Error loading tasks: ${error.message}</p>`;
            knowledgeContent.innerHTML = `<p class="error">Error loading knowledge items: ${error.message}</p>`;
        }
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || typeof unsafe === 'undefined') return 'N/A';
        return String(unsafe).replace(/[&<"'>]/g, function (match) {
            switch (match) {
                case '&': return '&';
                case '<': return '<';
                case '"': return '"';
                case '>': return '>';
                case "'": return '&#39;';
                default: return match;
            }
        });
    }

    function renderProjectDetails(project) {
        if (!project) {
            detailsContent.innerHTML = '<p>Project not found or no data.</p>';
            return;
        }

        let urlsToRender = [];
        if (typeof project.urls === 'string') {
            try { urlsToRender = JSON.parse(project.urls); } catch (e) { console.warn('Failed to parse project.urls JSON string:', project.urls, e); }
        } else if (Array.isArray(project.urls)) {
            urlsToRender = project.urls;
        }

        const urlsHtml = Array.isArray(urlsToRender) && urlsToRender.length > 0
            ? `<ul>${urlsToRender.map(url => url && url.url && url.title ? `<li><a href="${escapeHtml(url.url)}" target="_blank">${escapeHtml(url.title)}</a></li>` : '<li>Invalid URL entry</li>').join('')}</ul>`
            : 'N/A';

        let dependenciesText = 'N/A';
        if (project.dependencies && Array.isArray(project.dependencies) && project.dependencies.length > 0) {
            dependenciesText = project.dependencies.map(dep => escapeHtml(dep)).join(', ');
        } else if (typeof project.dependencies === 'string' && project.dependencies.trim() !== '') {
            dependenciesText = escapeHtml(project.dependencies);
        }
        
        detailsContent.innerHTML = `
            <div class="data-item"><strong>ID:</strong> ${escapeHtml(project.id)}</div>
            <div class="data-item"><strong>Name:</strong> ${escapeHtml(project.name)}</div>
            <div class="data-item"><strong>Description:</strong> <pre>${escapeHtml(project.description)}</pre></div>
            <div class="data-item"><strong>Status:</strong> ${escapeHtml(project.status)}</div>
            <div class="data-item"><strong>Task Type:</strong> ${escapeHtml(project.taskType)}</div>
            <div class="data-item"><strong>Completion Requirements:</strong> <pre>${escapeHtml(project.completionRequirements)}</pre></div>
            <div class="data-item"><strong>Output Format:</strong> <pre>${escapeHtml(project.outputFormat)}</pre></div>
            <div class="data-item"><strong>URLs:</strong> ${urlsHtml}</div>
            <div class="data-item"><strong>Dependencies:</strong> ${dependenciesText}</div>
            <div class="data-item"><strong>Created At:</strong> ${new Date(project.createdAt).toLocaleString()}</div>
            <div class="data-item"><strong>Updated At:</strong> ${new Date(project.updatedAt).toLocaleString()}</div>
        `;
    }

    function renderTasks(tasks) {
        if (!tasks || tasks.length === 0) {
            tasksContent.innerHTML = '<p>No tasks for this project.</p>';
            return;
        }
        tasksContent.innerHTML = tasks.map(task => {
            if (!task || typeof task !== 'object') {
                console.error('Invalid task object encountered:', task);
                return `<div class="data-item error">Error rendering an invalid task object. See console.</div>`;
            }
            try {
                let taskUrlsToRender = [];
                if (typeof task.urls === 'string') {
                    try { taskUrlsToRender = JSON.parse(task.urls); } catch (e) { console.warn(`Failed to parse task.urls for task ${task.id || 'unknown'}:`, task.urls, e); }
                } else if (Array.isArray(task.urls)) {
                    taskUrlsToRender = task.urls;
                }

                const urlsHtml = Array.isArray(taskUrlsToRender) && taskUrlsToRender.length > 0
                    ? `URLs: ${taskUrlsToRender.map(u => u && u.url && u.title ? `<a href="${escapeHtml(u.url)}" target="_blank">${escapeHtml(u.title)}</a>` : 'Invalid URL entry').join(', ')}<br>`
                    : '';
                
                const tagsHtml = task.tags && Array.isArray(task.tags) && task.tags.length > 0 ? `Tags: ${task.tags.map(t => escapeHtml(t)).join(', ')}<br>` : '';
                const dependenciesHtml = task.dependencies && Array.isArray(task.dependencies) && task.dependencies.length > 0 ? `Dependencies: ${task.dependencies.map(d => escapeHtml(d)).join(', ')}<br>` : '';

                return `
                    <div class="data-item">
                        <strong>${escapeHtml(task.title)} (ID: ${escapeHtml(task.id)})</strong> - Status: ${escapeHtml(task.status)} - Priority: ${escapeHtml(task.priority)}<br>
                        Description: <pre>${escapeHtml(task.description)}</pre>
                        Type: ${escapeHtml(task.taskType)}<br>
                        Completion: <pre>${escapeHtml(task.completionRequirements)}</pre>
                        Output: <pre>${escapeHtml(task.outputFormat)}</pre>
                        ${task.assignedTo ? `Assigned To: ${escapeHtml(task.assignedTo)}<br>` : ''}
                        ${tagsHtml}
                        ${urlsHtml}
                        ${dependenciesHtml}
                        Created: ${task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A'} | Updated: ${task.updatedAt ? new Date(task.updatedAt).toLocaleString() : 'N/A'}
                    </div>`;
            } catch (renderError) {
                console.error(`Error rendering task ${task.id || 'unknown'}:`, renderError, task);
                return `<div class="data-item error">Error rendering task ID ${task.id || 'unknown'}. See console.</div>`;
            }
        }).join('');
        if (tasksContent.innerHTML.trim() === '' && tasks.length > 0) {
            tasksContent.innerHTML = '<p class="error">All tasks failed to render. Check console.</p>';
        }
    }

    function renderKnowledge(knowledgeItems) {
        if (!knowledgeItems || knowledgeItems.length === 0) {
            knowledgeContent.innerHTML = '<p>No knowledge items for this project.</p>';
            return;
        }
        knowledgeContent.innerHTML = knowledgeItems.map(item => {
             if (!item || typeof item !== 'object') {
                console.error('Invalid knowledge object encountered:', item);
                return `<div class="data-item error">Error rendering an invalid knowledge object. See console.</div>`;
            }
            try {
                const tagsHtml = item.tags && Array.isArray(item.tags) && item.tags.length > 0 ? `Tags: ${item.tags.map(t => escapeHtml(t)).join(', ')}<br>` : '';
                const citationsHtml = item.citations && Array.isArray(item.citations) && item.citations.length > 0 ? `Citations: <ul>${item.citations.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : '';

                return `
                    <div class="data-item">
                        <strong>ID: ${escapeHtml(item.id)}</strong> - Domain: ${escapeHtml(item.domain)}<br>
                        Text: <pre>${escapeHtml(item.text)}</pre>
                        ${tagsHtml}
                        ${citationsHtml}
                        Created: ${item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'} | Updated: ${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'N/A'}
                    </div>`;
            } catch (renderError) {
                console.error(`Error rendering knowledge item ${item.id || 'unknown'}:`, renderError, item);
                return `<div class="data-item error">Error rendering knowledge item ID ${item.id || 'unknown'}. See console.</div>`;
            }
        }).join('');
         if (knowledgeContent.innerHTML.trim() === '' && knowledgeItems.length > 0) {
            knowledgeContent.innerHTML = '<p class="error">All knowledge items failed to render. Check console.</p>';
        }
    }

    projectSelect.addEventListener('change', (event) => {
        fetchProjectDetails(event.target.value);
    });

    refreshButton.addEventListener('click', fetchProjects);

    connectToNeo4j().then(connected => {
        if (connected) {
            fetchProjects();
        }
    });
});
