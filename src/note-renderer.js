const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const themes = require('./themes.js');
const clipboard = require('electron').clipboard;

// Global variable to store the note ID
let noteId;
let currentTheme;

const textArea = document.getElementById('textArea');
const bottomToolbar = document.querySelector('.bottom-toolbar');
const themeButton = document.getElementById('theme');
const themeMenu = document.getElementById('themeMenu');
const returnToListButton = document.getElementById('return-to-list');


function addFormattingButtons() {
    // Adds bold styles to the text
    const boldButton = document.createElement('button');
    boldButton.id = 'format-bold';
    boldButton.innerHTML = '<strong>B</strong>';
    boldButton.title = 'Bold'; 

    // Adds italic styles to the text
    const italicButton = document.createElement('button');
    italicButton.id = 'format-italic';
    italicButton.innerHTML = '<em>I</em>';  
    italicButton.title = 'Italic'; 

    // Adds bullet points to the text
    const bulletButton = document.createElement('button');
    bulletButton.id = 'format-bullet';
    bulletButton.innerHTML = '•';
    bulletButton.title = 'Bullet List'; 

    // Adds checkboxes to the text
    const checkboxButton = document.createElement('button');
    checkboxButton.id = 'format-checkbox';
    checkboxButton.innerHTML = '☐';
    checkboxButton.title = 'Task List';

    const themeButton = document.getElementById('theme');
    themeButton.title = 'Choose Theme';

    bottomToolbar.insertBefore(boldButton, themeButton.nextSibling);
    bottomToolbar.insertBefore(italicButton, boldButton.nextSibling);
    bottomToolbar.insertBefore(bulletButton, italicButton.nextSibling);
    bottomToolbar.insertBefore(checkboxButton, bulletButton.nextSibling);

    // Adds click event to apply bold styles
    boldButton.addEventListener('click', () => {
        document.execCommand('bold', false, null); 
        textArea.focus();
    });

    // Adds click event to apply italic styles
    italicButton.addEventListener('click', () => {
        document.execCommand('italic', false, null); 
        textArea.focus();
    });

    bulletButton.addEventListener('click', createBulletList);

    checkboxButton.addEventListener('click', createCheckboxList);   
}

function createBulletList() {
    const selection = window.getSelection();
    
    if (selection.toString().length > 0) {
        const text = selection.toString();
        const lines = text.split('\n'); 

        const listItems = lines.map(line => `<li>${line.trim()}</li>`).join('');
        const list = `<ul>${listItems}</ul>`;

        document.execCommand('insertHTML', false, list);
    } else {
        document.execCommand('insertHTML', false, '<ul><li>Item</li></ul>');
    }

    textArea.focus();
}

function createCheckboxList() {
    const selection = window.getSelection();
    
    if (selection.toString().length > 0) {
        const text = selection.toString();
        const lines = text.split('\n');

        const listItems = lines.map(line =>
            `<li><input type="checkbox" class="task-checkbox" onclick="event.stopPropagation();">${line.trim()}</li>`
        ).join('');
        const list = `<ul class="task-list">${listItems}</ul>`;

        document.execCommand('insertHTML', false, list);
    } else {
        // No line break in the command
        document.execCommand('insertHTML', false, 
            '<ul class="task-list"><li><input type="checkbox" class="task-checkbox" onclick="event.stopPropagation();">Item</li></ul>');
    }

    setupCheckboxes();
    textArea.focus();
}

function setupCheckboxes() {
    document.querySelectorAll('.task-checkbox').forEach(checkbox => {
        if (!checkbox.hasAttribute('data-initialized')) {
            checkbox.setAttribute('data-initialized', 'true');

            // Check if the checkbox is already checked and apply the corresponding class
            const listItem = checkbox.closest('li');
            if (checkbox.checked || checkbox.hasAttribute('checked')) {
                checkbox.checked = true;
                checkbox.setAttribute('checked', '');
                listItem.classList.add('completed');
            }

            checkbox.addEventListener('change', function(e) {
                e.stopPropagation();

                const listItem = this.closest('li');

                if (this.checked) {
                    listItem.classList.add('completed');
                    this.setAttribute('checked', '');
                } else {
                    listItem.classList.remove('completed');
                    this.removeAttribute('checked');
                }

                // Save the note after checkbox state changes
                setTimeout(() => {
                    document.getElementById('save-note').click();
                }, 100);
            });

            // Prevent the click event from propagating
            checkbox.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
    });
}

// Function to ensure the cursor is visible
function ensureCursorVisible() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.startContainer.parentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Modification in the paste event to handle images embedded in the text
textArea.addEventListener('paste', (event) => {
    // Prevents the default paste behavior
    event.preventDefault();
    
    // Checks if there are image data in the clipboard
    const clipboardItems = event.clipboardData.items;
    let imageFound = false;
    
    if (clipboardItems) {
        // Iterates through all clipboard items
        for (let i = 0; i < clipboardItems.length; i++) {
            if (clipboardItems[i].type.indexOf('image') !== -1) {
                imageFound = true;
                
                // Get the image file from the clipboard item
                const blob = clipboardItems[i].getAsFile();
                
                // Convert the blob to a data URL
                const reader = new FileReader();
                reader.onload = function(e) {
                    // Insert the image at the cursor position
                    insertImageAtCursor(e.target.result);
                };
                reader.readAsDataURL(blob);
                
                // Exit the loop after finding an image
                break;
            }
        }
    }
    
    // If no image is found, process as plain text
    if (!imageFound) {
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }
});

// Function to insert an image at the cursor position
function insertImageAtCursor(imageData) {
    // Create a container for the image and the delete button
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.contentEditable = "false";
    
    // Create the image element
    const imgElement = document.createElement('img');
    imgElement.src = imageData;
    imgElement.className = 'embedded-image';
    imgElement.setAttribute('data-id', `img_${Date.now()}`);
    
    // Create the delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-image-btn';
    deleteBtn.innerHTML = ''; // 
    deleteBtn.contentEditable = "false";
    
    // Use onclick instead of addEventListener
    deleteBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Excluindo imagem nova...');
        wrapper.remove();
        // Save the note after removing an image
        setTimeout(() => {
            document.getElementById('save-note').click();
        }, 100);
    };
    
    // Add the image and delete button to the wrapper
    wrapper.appendChild(imgElement);
    wrapper.appendChild(deleteBtn);
    
    // Use onclick para a imagem também
    imgElement.onclick = function(e) {
        // Remove the class 'selected' from all images
        document.querySelectorAll('.text-area img').forEach(img => {
            img.classList.remove('selected');
        });
        // Add the class 'selected' to the clicked image
        this.classList.add('selected');
        e.stopPropagation();
    };
    
    // Insert the wrapper at the cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(wrapper);
        
        // Move the cursor after the wrapper
        range.setStartAfter(wrapper);
        range.setEndAfter(wrapper);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        // If no selection, add to the end
        textArea.appendChild(wrapper);
    }
    
    // Add a paragraph break after the image
    document.execCommand('insertParagraph');
    
    // Make sure the image is visible
    ensureCursorVisible();
    
    // Save the note automatically
    setTimeout(() => {
        document.getElementById('save-note').click();
    }, 100);
}

// Remove clicks anywhere to deselect images
textArea.addEventListener('click', (e) => {
    if (e.target !== textArea && !e.target.classList.contains('embedded-image')) {
        // If clicked on anything other than an image or the editor
        document.querySelectorAll('.text-area img').forEach(img => {
            img.classList.remove('selected');
        });
    }
});

returnToListButton.addEventListener('click', () => {
    console.log('Retornando para a lista...');
    ipcRenderer.send('return-to-main-window', noteId);
});

function createThemeMenu() {
    themeMenu.innerHTML = '';
    
    Object.entries(themes).forEach(([themeName, theme]) => {
        const themeOption = document.createElement('div');
        themeOption.className = 'theme-option';
        themeOption.style.backgroundColor = theme.background;

        if (themeName === currentTheme) {
            themeOption.classList.add('active');
        }

        themeOption.addEventListener('click', () => {
            changeTheme(themeName);
            hideThemeMenu();
        });

        themeMenu.appendChild(themeOption);
    });
}

function showThemeMenu() {
    createThemeMenu();
    themeMenu.classList.add('visible');

    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 10);
}

function hideThemeMenu() {
    themeMenu.classList.remove('visible');
    document.removeEventListener('click', handleClickOutside);
}

function handleClickOutside(event) {
    if (!themeMenu.contains(event.target) && event.target !== themeButton) {
        hideThemeMenu();
    }
}

function changeTheme(themeName) {
    if (themes[themeName]) {
        const theme = themes[themeName];
        currentTheme = themeName;

        document.body.style.backgroundColor = theme.background;
        document.querySelector('.toolbar').style.backgroundColor = theme.toolbar;
        document.querySelector('.bottom-toolbar').style.backgroundColor = theme.toolbar;

        console.log('Tema alterado:', currentTheme);

        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach((option) => {
            option.classList.remove('active');

            if (option.style.backgroundColor === theme.background) {
                option.classList.add('active');
            }
        });
    }
}

themeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (themeMenu.classList.contains('visible')) {
        hideThemeMenu();
    } else {
        showThemeMenu();
    }
});

// Receive the note ID
ipcRenderer.on('set-note-id', (event, id) => {
    noteId = id;
    console.log('Nota recebeu ID:', noteId);
});

// Update for loading note content
ipcRenderer.on('load-note-content', (event, noteData) => {
    console.log('Carregando nota:', noteData);
    
    if (typeof noteData === 'string') {
        // Compatibility with the old format (plain text)
        textArea.innerText = noteData;
        
        // Apply a random theme for old notes
        const themeKeys = Object.keys(themes);
        currentTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
        } else {
        // New format (JSON object)
        // Format migration: checks if the content is HTML or plain text
        if (noteData.isHtml) {
            // If it's already HTML, load it directly
            textArea.innerHTML = noteData.content || '';
        } else if (noteData.content) {
            // If it's plain text, convert it to safe text
            textArea.innerText = noteData.content;
            
            // If there are images in the old format, insert them in the new format
            if (noteData.images && noteData.images.length > 0) {
                noteData.images.forEach(img => {
                    // Create a paragraph to contain the image
                    const p = document.createElement('p');
                    
                    // Create the image
                    const imgElement = document.createElement('img');
                    imgElement.src = img.data;
                    imgElement.className = 'embedded-image';
                    imgElement.setAttribute('data-id', img.id);
                    
                    // Add image to the paragraph
                    p.appendChild(imgElement);
                    
                    // Add paragraph to the editor
                    textArea.appendChild(p);
                });
            }
        } else {
            // Fallback if there is no content
            textArea.innerHTML = '';
        }
        
        // Apply the saved theme
        if (noteData.theme && themes[noteData.theme]) {
            currentTheme = noteData.theme;
        } else {
            // Fallback to a random theme
            const themeKeys = Object.keys(themes);
            currentTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
        }
    }
    
    // Apply the theme
    const theme = themes[currentTheme];
    document.body.style.backgroundColor = theme.background;
    document.querySelector('.toolbar').style.backgroundColor = theme.toolbar;
    document.querySelector('.bottom-toolbar').style.backgroundColor = theme.toolbar;
    
    // Set up events for existing images after a small delay to ensure the DOM is ready
    setTimeout(() => {
        setupExistingImages();
    }, 100);

    setTimeout(() => {
        setupExistingCheckboxes();
    }, 200);
});

// Configure events for existing images after loading the content
function setupExistingImages() {
    console.log('Setting up existing images...');
    
    // First, find all images within the editor
    document.querySelectorAll('.text-area img').forEach(img => {
        console.log('Processing existing image:', img);
        
        // Check if the image is already inside a wrapper
        if (img.parentElement && img.parentElement.classList.contains('image-wrapper')) {
            console.log('Image is already in a wrapper, reconfiguring...');
            
            // Remove old wrapper and create a new one
            const oldWrapper = img.parentElement;
            const newWrapper = document.createElement('div');
            newWrapper.className = 'image-wrapper';
            newWrapper.contentEditable = "false";
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-image-btn';
            deleteBtn.innerHTML = '';
            deleteBtn.contentEditable = "false";
            
            // Set up click event for the delete button
            deleteBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Deleting image...');
                newWrapper.remove();
                // Save the note after removing the image
                setTimeout(() => {
                    document.getElementById('save-note').click();
                }, 100);
            };
            
            // Replace the old wrapper with the new one
            oldWrapper.parentNode.insertBefore(newWrapper, oldWrapper);
            newWrapper.appendChild(img);
            newWrapper.appendChild(deleteBtn);
            oldWrapper.remove();
        } else {
            console.log('Criando novo wrapper para imagem...');
            
            // Create a wrapper for the image
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';
            wrapper.contentEditable = "false";
            
            // Create the delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-image-btn';
            deleteBtn.innerHTML = '';
            deleteBtn.contentEditable = "false";
            
            // Set up a click event for the delete button using onclick
            deleteBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Deleting image...');
                wrapper.remove();
                // Save the note after removing the image
                setTimeout(() => {
                    document.getElementById('save-note').click();
                }, 100);
            };
            
            // Replace the image with the wrapper
            if (img.parentNode) {
                img.parentNode.insertBefore(wrapper, img);
                wrapper.appendChild(img);
                wrapper.appendChild(deleteBtn);
            }
        }
        
        // Add click event to select the image
        img.onclick = function(e) {
            // Remove the 'selected' class from all images
            document.querySelectorAll('.text-area img').forEach(img => {
            img.classList.remove('selected');
            });
            // Add the 'selected' class to the clicked image
            this.classList.add('selected');
            e.stopPropagation();
        };
        });
    }

    // Confirmation of note saved
    ipcRenderer.on('note-saved', (event, id) => {
        console.log('Note successfully saved:', id);
        
        // Show visual feedback
    const saveFeedback = document.getElementById('saveFeedback');
    saveFeedback.classList.add('show');
    
    // Hide the feedback after 2 seconds
    setTimeout(() => {
        saveFeedback.classList.remove('show');
    }, 2000);
});

// Apply a random theme when loading a new note
document.addEventListener('DOMContentLoaded', () => {
    const toolbar = document.querySelector('.toolbar');
    const bottomToolbar = document.querySelector('.bottom-toolbar');
    const body = document.body;

    const themeKeys = Object.keys(themes);
    currentTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    const randomTheme = themes[currentTheme];

    body.style.backgroundColor = randomTheme.background;
    toolbar.style.backgroundColor = randomTheme.toolbar;
    bottomToolbar.style.backgroundColor = randomTheme.toolbar;
    
    console.log('Tema aplicado:', currentTheme);

    bottomToolbar.classList.add('visible');

    addFormattingButtons();

    addCheckboxStyles();

    setupExistingCheckboxes();
    
    // Set up support for drag and drop images
    setupDragAndDrop();
    
    // Add placeholder for contentEditable
    textArea.setAttribute('placeholder', 'Type your note here...');
    
    // Set up existing images
    setupExistingImages();
    
    // Focus on the editor on startup
    textArea.focus();
});

function setupExistingCheckboxes() {
    console.log('Configurando checkboxes existentes...');
    
    // Ensure all checkboxes have the correct class
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if (!checkbox.classList.contains('task-checkbox')) {
            checkbox.classList.add('task-checkbox');
        }
        
        // Ensure the parent item has the correct class if it is checked
        const listItem = checkbox.closest('li');
        if (listItem) {
            // Check both the property and attribute
            if (checkbox.checked || checkbox.hasAttribute('checked')) {
                checkbox.checked = true;
                checkbox.setAttribute('checked', ''); // Ensure the attribute is set
                listItem.classList.add('completed');
            }
        }
    });
    
    // Set up events for the checkboxes
    setupCheckboxes();
}

function addCheckboxStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .task-list {
            list-style-type: none;
            padding-left: 10px;
        }
        
        .task-checkbox {
            margin-right: 8px;
            cursor: pointer;
        }
        
        li.completed {
            text-decoration: line-through;
            color: #888;
        }
    `;
    document.head.appendChild(style);
}

// Update the save function to store complete HTML
document.getElementById('save-note').addEventListener('click', () => {
    // Save the full editor content, including HTML
    const noteContent = textArea.innerHTML;
    
    // Check if the note ID is defined
    if (!noteId) {
        console.error('Note ID not defined');
        return;
    }
    
    // Check if the theme is defined
    if (!currentTheme) {
        console.error('Theme not defined');
        // Apply a default theme
        const themeKeys = Object.keys(themes);
        currentTheme = themeKeys[0];
    }
    
    console.log('Saving note as HTML:', noteId, 'with theme:', currentTheme);
    
    // Create an object with the HTML content and theme
    const noteData = {
        content: noteContent,
        theme: currentTheme,
        isHtml: true  // Marks that the content is now HTML
    };
    
    // Send to the main process to save
    ipcRenderer.send('save-note', { noteId, noteData });
});

// Set up support for drag and drop images
function setupDragAndDrop() {
    const dropZone = document.querySelector('.content');
    
    // Prevents the default browser behavior when dragging files
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Adds a visual class when a file is being dragged over the area
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropZone.classList.add('highlight');
    }
    
    function unhighlight() {
        dropZone.classList.remove('highlight');
    }
    
    // Processes the files when they are dropped
    dropZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        handleFiles(files);
    }
    
    function handleFiles(files) {
        if (files.length > 0) {
            [...files].forEach(file => {
                // Checks if it is an image
                if (file.type.match('image.*')) {
                    const reader = new FileReader();
                    
                    reader.onload = function(e) {
                        insertImageAtCursor(e.target.result);
                    };
                    
                    reader.readAsDataURL(file);
                }
            });
        }
    }
}

// Handlers for note buttons
document.getElementById('open-new-note').addEventListener('click', () => {
    ipcRenderer.send('open-new-note');
});

document.getElementById('close-note').addEventListener('click', () => {
    console.log('Closing note with ID:', noteId);
    ipcRenderer.send('close-note', noteId);
});

document.getElementById('minimize-note').addEventListener('click', () => {
    console.log('Minimizing note with ID:', noteId);
    ipcRenderer.send('minimize-note', noteId);
});

textArea.addEventListener('focus', () => {
    bottomToolbar.classList.remove('visible');
    hideThemeMenu();
});

textArea.addEventListener('click', (e) => {
    if (!e.target.classList.contains('task-checkbox')) {
    }
});

// Show toolbar when the user clicks outside the text area
window.addEventListener('click', (event) => {
    const noteWindow = document.querySelector('.content');
    // Checks if the click was outside the text area and the note window
    if (!noteWindow.contains(event.target)) {
        bottomToolbar.classList.add('visible');
    }
});

// Also show the toolbar when the mouse leaves the note window
document.addEventListener('mouseleave', () => {
    bottomToolbar.classList.add('visible');
});