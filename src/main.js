const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const themes = require('./themes.js');
const os = require('os');
const schedule = require('node-schedule');

app.setName('Workote');
app.setAppUserModelId('Workote');

const scheduledNotifications = {};

// User's current directory
const userDirectory = os.homedir(); // Returns the user's home directory

// New directory to save notes
const notesDirectory = path.join(userDirectory, 'AppData', 'Workote');

// Check if the directory exists, otherwise create it
if (!fs.existsSync(notesDirectory)) {
    fs.mkdirSync(notesDirectory, { recursive: true });
}

let win;
let notes = []; // Store multiple notes

if (!fs.existsSync(notesDirectory)) {
    fs.mkdirSync(notesDirectory);
}



function createWindow() {
    win = new BrowserWindow({
        width: 300,
        height: 500,
        resizable: false,
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, '..', 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    win.loadFile('src/index.html');
}

function newNote() {
    const note = new BrowserWindow({
        width: 275,
        height: 275,
        minWidth: 200,
        minHeight: 130,
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, '..', 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    // Generate a unique ID for each note
    newFunction();
    
    // When the note is closed, remove it from the array
    note.on('closed', () => {
        notes = notes.filter(n => n !== note);
    });

    function newFunction() {
        const noteId = Date.now().toString();
        note.noteId = noteId;

        notes.push(note); // Store the new note in the array
        note.loadFile('src/new-note.html');

        note.webContents.once('dom-ready', () => {
            // Send the ID to the note window for future reference
            note.webContents.send('set-note-id', noteId);
        });
    }
}

function saveScheduledNotifications() {
    const persistentNotificationsPath = path.join(notesDirectory, 'scheduled_notifications.json');
    
    // Prepare object to save
    const notificationsToSave = Object.keys(scheduledNotifications).map(noteId => {
        const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
        try {
            const noteData = JSON.parse(fs.readFileSync(noteFilePath, 'utf-8'));
            return {
                noteId: noteId,
                scheduledTime: noteData.notification.scheduledTime
            };
        } catch (err) {
            console.error('Error loading note data:', err);
            return null;
        }
    }).filter(item => item !== null);

    fs.writeFileSync(persistentNotificationsPath, JSON.stringify(notificationsToSave));
}

// Function to restore scheduled notifications after restarting the app
function restoreScheduledNotifications() {
    const persistentNotificationsPath = path.join(notesDirectory, 'scheduled_notifications.json');
    
    if (fs.existsSync(persistentNotificationsPath)) {
        try {
            const savedNotifications = JSON.parse(fs.readFileSync(persistentNotificationsPath, 'utf-8'));
            
            savedNotifications.forEach(notification => {
                const scheduledTime = new Date(notification.scheduledTime);
                
                // Only restore if the notification is still in the future
                if (scheduledTime > new Date()) {
                    scheduleNoteNotification(notification.noteId, scheduledTime);
                }
            });
        } catch (err) {
            console.error('Error restoring notifications:', err);
        }
    }
}

function stripHtml(html) {
    if (!html) return 'You have a note to review';
    
    // First preserve line breaks by replacing relevant HTML tags with newlines
    let plainText = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<\/li>/gi, '\n');
    
    // Then remove all remaining HTML tags
    plainText = plainText.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    plainText = plainText
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    // Normalize whitespace (but preserve line breaks)
    plainText = plainText
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n'); // Replace 3+ consecutive line breaks with just 2
    
    return plainText || 'You have a note to review';
}

function scheduleNoteNotification(noteId, scheduledTime) {
    // Cancel previous notification if it exists
    if (scheduledNotifications[noteId]) {
        scheduledNotifications[noteId].cancel();
    }

    // Schedule a new notification
    const job = schedule.scheduleJob(scheduledTime, () => {
        const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
        
        try {
            const noteData = JSON.parse(fs.readFileSync(noteFilePath, 'utf-8'));
            
            // Check if the app is ready
            if (Notification.isSupported()) {
                new Notification({
                    title: 'Note Reminder',
                    body: stripHtml(noteData.content) || 'You have a note to review',
                    icon: path.join(__dirname, '..', 'notification.ico'),
                }).show();
    
                // Send event to update the icon
                win.webContents.send('notification-triggered', { 
                    success: true, 
                    noteId: noteId 
                });
            }
    
            // Remove notification information after it is triggered
            delete noteData.notification;
            
            // Save updated note
            fs.writeFileSync(noteFilePath, JSON.stringify(noteData));
        } catch (err) {
            console.error('Error loading note for notification:', err);
        }
    });

    // Store reference to the notification
    scheduledNotifications[noteId] = job;
}

// Add handler to schedule notification
ipcMain.on('schedule-note-notification', (event, { noteId, scheduledTime }) => {
    try {
        // Load note data
        const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
        const noteData = JSON.parse(fs.readFileSync(noteFilePath, 'utf-8'));

        // Add notification information
        noteData.notification = {
            scheduled: true,
            scheduledTime: scheduledTime
        };

        // Save updated note
        fs.writeFileSync(noteFilePath, JSON.stringify(noteData));

        // Schedule notification
        scheduleNoteNotification(noteId, new Date(scheduledTime));
        
        event.reply('notification-scheduled', { 
            success: true, 
            noteId: noteId 
        });
    } catch (err) {
        console.error('Error scheduling notification:', err);
        event.reply('notification-scheduled', { 
            success: false, 
            error: err.message 
        });
    }
});

// MOdify handler to cancel notification
ipcMain.on('cancel-note-notification', (event, noteId) => {
    try {
        const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
        const noteData = JSON.parse(fs.readFileSync(noteFilePath, 'utf-8'));

        delete noteData.notification;

        fs.writeFileSync(noteFilePath, JSON.stringify(noteData));

        if (scheduledNotifications[noteId]) {
            scheduledNotifications[noteId].cancel();
            delete scheduledNotifications[noteId];
        }

        saveScheduledNotifications();

        event.reply('notification-cancelled', { 
            success: true, 
            noteId: noteId 
        });
    } catch (err) {
        console.error('Error canceling notification:', err);
        event.reply('notification-cancelled', { 
            success: false, 
            error: err.message 
        });
    }
});

// Save note
ipcMain.on('save-note', (event, { noteId, noteData }) => {
    console.log('Received for save:', noteId, JSON.stringify(noteData));

    const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
    
    // SOLUTION 1: If you want to ensure notifications are preserved always
    // Check if the note exists and has notification data
    try {
        const existingData = fs.existsSync(noteFilePath) ? 
            JSON.parse(fs.readFileSync(noteFilePath, 'utf-8')) : {};
            
        // If the existing note has notification data but the new data doesn't, preserve it
        if (existingData.notification && !noteData.notification) {
            noteData.notification = existingData.notification;
        }
    } catch (err) {
        console.error('Error reading existing note data during save:', err);
        // Continue with save anyway
    }
    
    // Save the note content to the file
    fs.writeFile(noteFilePath, JSON.stringify(noteData), (err) => {
        if (err) {
            console.error('Error saving note:', err);
            return;
        }

        // Notify that the note has been saved
        event.sender.send('note-saved', noteId);
        
        // Update the list of notes in the main window
        loadSavedNotes();
    });
});


ipcMain.on('return-to-main-window', (event, noteId) => {
    // Approach: Instead of hiding the note window, close it properly
    // and make sure the main window is visible
    
    // Make the main window appear if it exists
    if (win && !win.isDestroyed()) {
        // Show the main window
        if (win.isMinimized()) {
            win.restore();
        }
        win.show();
        win.focus();
        
        // Refresh notes to ensure they're up to date
        loadSavedNotes();
    } else {
        // If main window doesn't exist, create one
        createWindow();
        
        // Make sure notes are loaded when it's ready
        win.webContents.once('dom-ready', () => {
            loadSavedNotes();
        });
    }
    
    // Close the note window more conventionally
    const noteWindow = notes.find(note => note.noteId === noteId);
    if (noteWindow && !noteWindow.isDestroyed()) {
        
        noteWindow.close();
    }
});




// Function to load saved notes
function loadSavedNotes() {
    fs.readdir(notesDirectory, (err, files) => {
        if (err) {
            console.error('Error reading saved notes:', err);
            return;
        }

        // Filter only JSON and TXT files
        const noteFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.txt'));
        
        // Get file stats to sort by modification time
        const fileStats = [];
        
        // Create promises for getting file stats
        const statPromises = noteFiles.map(file => {
            return new Promise((resolve) => {
                const filePath = path.join(notesDirectory, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        console.error(`Error getting stats for ${file}:`, err);
                        resolve(null);
                    } else {
                        resolve({
                            file: file,
                            mtime: stats.mtime // Modification time
                        });
                    }
                });
            });
        });
        
        // Wait for all stat operations to complete
        Promise.all(statPromises)
            .then(results => {
                // Filter out any null results (errors)
                const validResults = results.filter(result => result !== null);
                
                // Sort files by modification time (newest first)
                validResults.sort((a, b) => b.mtime - a.mtime);
                
                // Extract just the filenames in the new sorted order
                const sortedNoteFiles = validResults.map(result => result.file);
                
                console.log('Notes sorted by modification date:', sortedNoteFiles);
                
                // Send the sorted list to the renderer
                if (win && !win.isDestroyed()) {
                    win.webContents.send('update-note-cards', sortedNoteFiles);
                }
            })
            .catch(error => {
                console.error('Error sorting notes:', error);
                
                // Fallback: just send unsorted list if there's an error
                if (win && !win.isDestroyed()) {
                    win.webContents.send('update-note-cards', noteFiles);
                }
            });
    });
}

// Load saved notes when the app starts
app.whenReady().then(() => {
    createWindow();
    
    // Load saved notes when the main window is ready
    win.webContents.once('dom-ready', () => {
        loadSavedNotes();
        
        // Restore scheduled notifications
        restoreScheduledNotifications();
    });
});

// Handle window closing events
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    saveScheduledNotifications();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Open existing note
ipcMain.on('open-note', (event, noteId) => {
    // Check if the note is already open
    const existingNote = notes.find(note => note.noteId === noteId);
    if (existingNote && !existingNote.isDestroyed()) {
        existingNote.focus();
        return;
    }

    // Create a new window for the note
    const note = new BrowserWindow({
        width: 275,
        height: 275,
        minWidth: 200,
        minHeight: 130,
        frame: false,
        alwaysOnTop: true,
        icon: 'C:/Users/kauad/Desktop/Notas/icon.ico',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    note.noteId = noteId;
    notes.push(note);
    note.loadFile('src/new-note.html');

    note.webContents.once('dom-ready', () => {
        // Send the ID to the note window
        note.webContents.send('set-note-id', noteId);
        
        // Load note content
        const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
        fs.readFile(noteFilePath, 'utf-8', (err, data) => {
            if (err) {
                console.error('Error opening the note:', err);
                return;
            }
            const noteData = JSON.parse(data);
            note.webContents.send('load-note-content', noteData);
        });
    });
    
    note.on('closed', () => {
        notes = notes.filter(n => n !== note);
    });
});

// IPC handlers for note windows
ipcMain.on('close-note', (event, noteId) => {
    // Find the specific note by ID
    const noteToClose = notes.find(note => note.noteId === noteId);
    if (noteToClose && !noteToClose.isDestroyed()) {
        noteToClose.close();
    }
});

ipcMain.on('open-new-note', () => {
    newNote();  // Calls the function that creates a new note
});

ipcMain.on('minimize-note', (event, noteId) => {
    // Find the specific note by ID
    const noteToMinimize = notes.find(note => note.noteId === noteId);
    if (noteToMinimize && !noteToMinimize.isDestroyed()) {
        noteToMinimize.minimize();
    }
});

// IPC handlers for the main window
ipcMain.on('new-note', () => {
    newNote();
});

ipcMain.on('minimize-window', () => {
    win.minimize();
});

ipcMain.on('close-window', () => {
    win.close();
});

ipcMain.on('delete-note', (event, noteId) => {
    const noteFilePath = path.join(notesDirectory, `${noteId}.json`);
    
    // Check if the file exists
    fs.access(noteFilePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error('File not found:', err);
            return;
        }
        
        // Delete the file
        fs.unlink(noteFilePath, (err) => {
            if (err) {
            console.error('Error deleting note:', err);
            return;
            }
            
            console.log('Note successfully deleted:', noteId);
            
            // Update the list of notes in the main window
            loadSavedNotes();
        });
    });
});