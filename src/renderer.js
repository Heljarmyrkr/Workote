const { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const themes = require('./themes.js');
const os = require('os');

// Define the notes directory
const userDirectory = os.homedir();
const notesDirectory = path.join(userDirectory, 'AppData', 'Workote');

// Application state
let allNotes = [];
let pinnedNotes = [];
const DOM = {}; // To store references to frequently used DOM elements

// Initialization when the document is ready
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    // Capture and store frequently used DOM elements
    cacheDOM();
    
    // Load pinned notes
    loadPinnedNotes();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize search functionality
    initializeSearch();
}

function cacheDOM() {
    DOM.noteList = document.getElementById('note-list');
    DOM.searchInput = document.getElementById('search-input');
    DOM.clearSearchButton = document.getElementById('clear-search');
    DOM.newButton = document.getElementById('new');
    DOM.minimizeButton = document.getElementById('minimize');
    DOM.closeButton = document.getElementById('close');
}

function loadPinnedNotes() {
    const savedPinnedNotes = localStorage.getItem('pinnedNotes');
    if (savedPinnedNotes) {
        pinnedNotes = JSON.parse(savedPinnedNotes);
    }
}

function setupEventListeners() {
    // Main window actions
    DOM.newButton.addEventListener('click', () => ipcRenderer.send('new-note'));
    DOM.minimizeButton.addEventListener('click', () => ipcRenderer.send('minimize-window'));
    DOM.closeButton.addEventListener('click', handleWindowClose);
    
    // Set up listener for note updates
    ipcRenderer.on('update-note-cards', handleNoteUpdate);
}

function handleWindowClose() {
    document.body.classList.add('fade-out');
    setTimeout(() => ipcRenderer.send('close-window'), 500);
}

function handleNoteUpdate(event, notes) {
    allNotes = notes;
    sortNotesByDate(notes)
        .then(sortedNotes => renderNoteCards(sortedNotes));
}

// Functions for search
function initializeSearch() {
    DOM.searchInput.addEventListener('input', handleSearchInput);
    DOM.clearSearchButton.addEventListener('click', clearSearch);
}

function handleSearchInput() {
    const searchTerm = DOM.searchInput.value.trim().toLowerCase();
    DOM.clearSearchButton.style.display = searchTerm ? 'block' : 'none';
    
    if (!searchTerm) {
        sortNotesByDate(allNotes)
            .then(sortedNotes => renderNoteCards(sortedNotes));
        return;
    }
    
    filterNotesByContent(searchTerm);
}

function clearSearch() {
    DOM.searchInput.value = '';
    DOM.clearSearchButton.style.display = 'none';
    sortNotesByDate(allNotes)
        .then(sortedNotes => renderNoteCards(sortedNotes));
}

function openNotificationModal(noteId) {
    // Create modal element with class for animation
    const modal = document.createElement('div');
    modal.classList.add('notification-modal');
    document.body.appendChild(modal);
    
    // Force reflow to properly start the animation
    modal.offsetWidth;
    
    // Start fade-in animation
    modal.style.opacity = '1';
    
    // Fetch note data...
    fetch(`file://${path.join(notesDirectory, `${noteId}.json`)}`)
        .then(response => response.json())
        .then(noteData => {
            // Create modal content...
            let modalContent = `...`;
            
            modal.innerHTML = modalContent;
            
            // Add entry class for animation
            const modalContentElement = modal.querySelector('.notification-modal-content');
            modalContentElement.style.transform = 'translateY(20px)';
            
            // Force reflow
            modalContentElement.offsetWidth;
            
            // Animate entry
            modalContentElement.style.transform = 'translateY(0)';
            
            // Set up function to close with animation
            function closeModalWithAnimation() {
                modal.style.opacity = '0';
                const modalContent = modal.querySelector('.notification-modal-content');
                if (modalContent) {
                    modalContent.classList.add('closing');
                    setTimeout(() => {
                        if (document.body.contains(modal)) {
                            document.body.removeChild(modal);
                        }
                    }, 300);
                }
            }
            
            // Add event listeners...
        })
        .catch(error => {
            console.error('Error loading note data:', error);
            alert('Unable to load note data.');
            document.body.removeChild(modal);
        });
}

// Functions for sorting and filtering notes
async function sortNotesByDate(notes) {
    if (notes.length === 0) return [];
    
    try {
        const notesWithDates = await Promise.all(notes.map(async note => {
            const noteId = note.split('.')[0]; // Extract noteId from the file name
            const noteFilePath = path.join(notesDirectory, note); // Use the full file path
            try {
                const stats = await fs.stat(noteFilePath);
                return {
                    filename: note,
                    modifiedTime: stats.mtime.getTime(),
                    idTimestamp: parseInt(note.split('.')[0])
                };
            } catch (err) {
                console.error('Error retrieving file stats:', err);
                return null;
            }
        }));
        
        // Filter out null notes and sort by modification date (most recent first)
        const validNotes = notesWithDates.filter(note => note !== null);
        validNotes.sort((a, b) => b.modifiedTime - a.modifiedTime);
        
        return validNotes.map(note => note.filename);
    } catch (err) {
        console.error('Error sorting notes:', err);
        return [];
    }
}

async function filterNotesByContent(searchTerm) {
    try {
        const matches = [];
        
        for (const note of allNotes) {
            const noteId = note.split('.')[0]; // Extract noteId
            const noteFilePath = path.join(notesDirectory, note); // Use the full file path
            try {
                const data = await fs.readFile(noteFilePath, 'utf-8');
                const noteData = JSON.parse(data);
                if (noteData.content.toLowerCase().includes(searchTerm)) {
                    matches.push(note);
                }
            } catch (err) {
                console.error('Error reading note for search:', err);
            }
        }
        
        const sortedMatches = await sortNotesByDate(matches);
        renderNoteCards(sortedMatches);
    } catch (err) {
        console.error('Error during search:', err);
    }
}

// Functions for handling pinned notes
function togglePinNote(noteId, pinButton) {
    const isPinned = pinnedNotes.some(note => note.id === noteId);

    if (isPinned) {
        removePinnedNote(noteId);
        updatePinButtonState(pinButton, false);
    } else {
        addPinnedNote(noteId);
        updatePinButtonState(pinButton, true);
    }

    ipcRenderer.send('request-notes');
}

function updatePinButtonState(pinButton, isPinned) {
    pinButton.classList.toggle('pinned', isPinned);
    pinButton.title = isPinned ? 'Unpin note' : 'Pin note';
    pinButton.querySelector('img').src = `icons/pin${isPinned ? '-filled' : ''}.png`;
    pinButton.querySelector('img').alt = isPinned ? 'Unpin' : 'Pin';
}

function addPinnedNote(noteId) {
    if (!pinnedNotes.some(note => note.id === noteId)) {
        pinnedNotes.push({
            id: noteId,
            pinnedAt: Date.now()
        });

        pinnedNotes.sort((a, b) => b.pinnedAt - a.pinnedAt);
        localStorage.setItem('pinnedNotes', JSON.stringify(pinnedNotes));
    }
}

function removePinnedNote(noteId) {
    pinnedNotes = pinnedNotes.filter(note => note.id !== noteId);
    localStorage.setItem('pinnedNotes', JSON.stringify(pinnedNotes));

    const card = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
    if (card) {
        card.classList.remove('pinned');
    }
}

// Rendering notes
async function renderNoteCards(notes) {
    DOM.noteList.innerHTML = ''; // Clear the list before adding new cards

    if (notes.length === 0) {
        renderEmptyNotesMessage();
        return;
    }

    // Separate pinned and unpinned notes
    const pinnedNoteIds = pinnedNotes.map(note => note.id);
    const pinnedNotesFromList = notes.filter(note => pinnedNoteIds.includes(note.split('.')[0]));
    const unpinnedNotes = notes.filter(note => !pinnedNoteIds.includes(note.split('.')[0]));
    
    // Render pinned notes first, then normal notes
    const orderedNotes = [...pinnedNotesFromList, ...unpinnedNotes];

    // Use fragment for better performance
    const fragment = document.createDocumentFragment();
    
    for (const note of orderedNotes) {
        try {
            const noteCard = await createNoteCard(note);
            if (noteCard) {
                fragment.appendChild(noteCard);
            }
        } catch (err) {
            console.error('Error creating card for the note:', note, err);
        }
    }
    
    DOM.noteList.appendChild(fragment);
}

function renderEmptyNotesMessage() {
    const emptyMessage = document.createElement('div');
    emptyMessage.classList.add('empty-notes-message');
    emptyMessage.textContent = "Click the + to create a note"
    DOM.noteList.appendChild(emptyMessage);
}

async function createNoteCard(note) {
    const noteId = note.split('.')[0];
    const isPinned = pinnedNotes.some(note => note.id === noteId);
    const noteFilePath = path.join(notesDirectory, note); // Use the full file name
    
    try {
        const data = await fs.readFile(noteFilePath, 'utf-8');
        const noteData = JSON.parse(data);
        
        const { content, theme, isHtml } = noteData;
        const createdAt = new Date(parseInt(noteId));
        const formattedDate = formatDate(createdAt);
        const cleanContent = stripHtml(content);
        const title = extractTitle(cleanContent);
        const preview = extractPreview(cleanContent, title, 120);
        const wordCount = countWords(cleanContent);
        const hasNotification = hasScheduledNotification(noteData);

        // Create the card element
        const noteCard = document.createElement('div');
        noteCard.classList.add('note-card', 'fade-in');
        if (isPinned) {
            noteCard.classList.add('pinned');
        }
        noteCard.setAttribute('data-note-id', noteId);
        noteCard.setAttribute('data-content', cleanContent.toLowerCase());

        // Apply theme
        applyThemeToCard(noteCard, theme);
        
        // Check if there is an image in the content
        const { hasImage, imagePreview } = extractImagePreview(content, isHtml);
        if (hasImage) {
            noteCard.classList.add('has-image');
        }

        noteCard.innerHTML = `
            <div class="note-card-header">
            <h3 class="note-title" title="${title}">${title}</h3>
            <div class="note-metadata">
                <span class="note-date">${formattedDate}</span>
                <span class="note-word-count">${wordCount} words</span>
            </div>
            </div>
            <div class="note-content">
            <p class="note-preview">${preview}</p>
            ${imagePreview}
            </div>
            <div class="note-card-footer">
            <button class="pin-note ${isPinned ? 'pinned' : ''}" data-note-id="${noteId}" title="${isPinned ? 
                'Unpin note' : 'Pin note'}">
                <img src="icons/pin${isPinned ? '-filled' : ''}.png" alt="${isPinned ? 'Unpin' : 'Pin'}" />
            </button>
            <button class="schedule-notification ${hasNotification ? 'notification-scheduled' : ''}" 
                data-note-id="${noteId}" 
                title="${hasNotification ? 'Notification Scheduled' : 'Schedule Notification'}">
                <img src="icons/${hasNotification ? 'notification-scheduled' : 'notification'}.png" 
                 alt="${hasNotification ? 'Notification Scheduled' : 'Schedule Notification'}" />
            </button>
            <button class="delete-note" data-note-id="${noteId}" title="Delete note">
                <img src="icons/trash.png" alt="Delete" />
            </button>
            </div>
        `;
        

        // Attach event listeners
        attachCardEventListeners(noteCard, noteId, isPinned);
        
        // Configure image zoom if necessary
        if (hasNotification) {
            const notificationBtn = noteCard.querySelector('.schedule-notification');
            notificationBtn.addEventListener('click', () => {
                const noteId = notificationBtn.getAttribute('data-note-id');
                openNotificationCancellationConfirmation(noteId);
            });
        }

        return noteCard;
    } catch (err) {
        console.error('Error processing the note:', err);
        return null;
    }
}

ipcRenderer.on('notification-scheduled', (event, result) => {
    if (result.success) {
 
        // Update the notification button appearance
        const notificationBtn = document.querySelector(`.schedule-notification[data-note-id="${result.noteId}"]`);
        if (notificationBtn) {
            notificationBtn.classList.add('notification-scheduled');
            const img = notificationBtn.querySelector('img');
            img.src = 'icons/notification-scheduled.png';
            img.alt = 'Scheduled Notification';
            notificationBtn.title = 'Scheduled Notification';
        }
    } else {
        alert('Error scheduling notification: ' + result.error);
    }
});

ipcRenderer.on('notification-triggered', (event, result) => {
    if (result.success) {
        // Update the notification button appearance
        const notificationBtn = document.querySelector(`.schedule-notification[data-note-id="${result.noteId}"]`);
        if (notificationBtn) {
            notificationBtn.classList.remove('notification-scheduled');
            const img = notificationBtn.querySelector('img');
            img.src = 'icons/notification.png';
            img.alt = 'Schedule Notification';
            notificationBtn.title = 'Schedule Notification';
        }
    }
});

ipcRenderer.on('notification-cancelled', (event, result) => {
    if (result.success) {
        
        // Update notification button appearance
        const notificationBtn = document.querySelector(`.schedule-notification[data-note-id="${result.noteId}"]`);
        if (notificationBtn) {
            notificationBtn.classList.remove('notification-scheduled');
            const img = notificationBtn.querySelector('img');
            img.src = 'icons/notification.png';
            img.alt = 'Schedule Notification';
            notificationBtn.title = 'Schedule Notification';
        }
    } else {
        alert('Error canceling notification');
    }
});

function openNotificationCancellationConfirmation(noteId) {
    const modal = document.createElement('div');
    modal.classList.add('notification-modal');
    modal.innerHTML = `
        <div class="notification-modal-content">
            <h3>Cancel Notification</h3>
            <p>Do you want to cancel the scheduled notification for this note?</p>
            <div class="modal-actions">
                <button id="confirm-cancel-btn">Yes, Cancel</button>
                <button id="dismiss-cancel-btn">Keep</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Function to close the modal with animation
    function closeModalWithAnimation() {
        const modalContent = modal.querySelector('.notification-modal-content');
        modalContent.classList.add('closing');
        setTimeout(() => {
            document.body.removeChild(modal);
        }, 300); // Waits for the animation to finish
    }

    const confirmCancelBtn = modal.querySelector('#confirm-cancel-btn');
    const dismissCancelBtn = modal.querySelector('#dismiss-cancel-btn');

    confirmCancelBtn.addEventListener('click', () => {
        ipcRenderer.send('cancel-note-notification', noteId);
        closeModalWithAnimation();
    });

    dismissCancelBtn.addEventListener('click', closeModalWithAnimation);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModalWithAnimation();
        }
    });
}

function applyThemeToCard(noteCard, themeName) {
    if (themeName && themes[themeName]) {
        const backgroundColor = themes[themeName].background;
        noteCard.style.backgroundColor = backgroundColor;
        
        if (themeName === 'softYellow') {
            noteCard.classList.add('soft-yellow-theme');
        } else {
            noteCard.style.color = isLightColor(backgroundColor) ? '#000' : '#fff';
        }
    }
}

function extractImagePreview(content, isHtml) {
    let imagePreview = '';
    let hasImage = false;
    
    if (isHtml) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const firstImage = tempDiv.querySelector('img');
        
        if (firstImage) {
            hasImage = true;
            imagePreview = `
                <div class="image-preview">
                    <div class="image-container">
                        <img src="${firstImage.src}" alt="Preview" />
                    </div>
                </div>
            `;
        }
    }
    
    return { hasImage, imagePreview };
}

function setupImageZoom(noteCard) {
    const imageContainer = noteCard.querySelector('.image-container');
    if (imageContainer) {
        imageContainer.addEventListener('mouseenter', () => {
            imageContainer.classList.add('zoomed');
        });
        imageContainer.addEventListener('mouseleave', () => {
            imageContainer.classList.remove('zoomed');
        });
    }
}

// Event handling for note cards
function attachCardEventListeners(noteCard, noteId, isPinned) {
    noteCard.addEventListener('click', (e) => {
        if (e.target.closest('.delete-note')) {
            e.stopPropagation();
            confirmAndDeleteNote(noteId, isPinned);
        } else if (e.target.closest('.edit-note')) {
            e.stopPropagation();
            ipcRenderer.send('open-note', noteId);
        } else if (e.target.closest('.pin-note')) {
            e.stopPropagation();
            togglePinNote(noteId, e.target.closest('.pin-note'));
        } else if (e.target.closest('.schedule-notification')) {
            e.stopPropagation();
            openNotificationScheduler(noteId);
        } else if (!e.target.closest('.image-container')) {
            // Do not trigger when clicking on the image (to allow zoom)
            ipcRenderer.send('open-note', noteId);
        }
    });
}

function openNotificationScheduler(noteId) {
    // First, check if the note already has a scheduled notification
    const noteCard = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
    const notificationBtn = noteCard.querySelector('.schedule-notification');
    
    const modal = document.createElement('div');
    modal.classList.add('notification-modal');
    document.body.appendChild(modal);
    
    // We add a small delay so that the transition is smoother
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);

    // Fetch the note data to check existing notification
    fetch(`file://${path.join(notesDirectory, `${noteId}.json`)}`)
        .then(response => response.json())
        .then(noteData => {
            let modalContent = '';
            
            if (noteData.notification && noteData.notification.scheduledTime) {
                const scheduledTime = new Date(noteData.notification.scheduledTime);
                
                // Format the scheduled time for display
                const formattedDate = scheduledTime.toLocaleDateString('pt-BR', {
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric'
                });
                const formattedTime = scheduledTime.toLocaleTimeString('pt-BR', {
                    hour: '2-digit', 
                    minute: '2-digit'
                });

                // Modal content for existing notification
                modalContent = `
                    <div class="notification-modal-content">
                        <h3>Scheduled Notification</h3>
                        <div class="notification-details">
                            <p>Notification scheduled for:</p>
                            <strong>${formattedDate} at ${formattedTime}</strong>
                        </div>
                        <div class="modal-actions">
                            <button id="reschedule-btn">Reschedule</button>
                            <button id="cancel-btn">Cancel Notification</button>
                        </div>
                    </div>
                `;
            } else {
                // Modal content for new notification scheduling
                modalContent = `
                    <div class="notification-modal-content">
                        <h3>Schedule Notification</h3>
                        <div class="date-time-container">
                            <div class="input-group">
                                <input type="date" id="notification-date" required>
                                <label for="notification-date">Notification Date</label>
                                <span class="icon">📅</span>
                            </div>
                            <div class="input-group">
                                <input type="time" id="notification-time" required>
                                <label for="notification-time">Notification Time</label>
                                <span class="icon">⏰</span>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button id="schedule-btn">Schedule</button>
                            <button id="cancel-modal-btn">Cancel</button>
                        </div>
                    </div>
                `;
            }

            modal.innerHTML = modalContent;

            // Function to close the modal with animation
            function closeModalWithAnimation() {
                const modalContent = modal.querySelector('.notification-modal-content');
                if (modalContent) {
                    modalContent.classList.add('closing');
                    setTimeout(() => {
                        document.body.removeChild(modal);
                    }, 300);
                } else {
                    document.body.removeChild(modal);
                }
            }

            // Event Listeners
            if (noteData.notification && noteData.notification.scheduledTime) {
                const rescheduleBtn = modal.querySelector('#reschedule-btn');
                const cancelBtn = modal.querySelector('#cancel-btn');

                rescheduleBtn.addEventListener('click', () => {
                    // Replace the modal content without closing it
                    const oldContent = modal.querySelector('.notification-modal-content');
                    oldContent.classList.add('closing');
                    
                    setTimeout(() => {
                        modal.innerHTML = `
                            <div class="notification-modal-content">
                                <h3>Reschedule Notification</h3>
                                <div class="date-time-container">
                                    <div class="input-group">
                                        <input type="date" id="notification-date" required>
                                        <label for="notification-date">Notification Date</label>
                                        <span class="icon">📅</span>
                                    </div>
                                    <div class="input-group">
                                        <input type="time" id="notification-time" required>
                                        <label for="notification-time">Notification Time</label>
                                        <span class="icon">⏰</span>
                                    </div>
                                </div>
                                <div class="modal-actions">
                                    <button id="schedule-btn">Reschedule</button>
                                    <button id="cancel-modal-btn">Cancel</button>
                                </div>
                            </div>
                        `;

                        const dateInput = modal.querySelector('#notification-date');
                        const timeInput = modal.querySelector('#notification-time');
                        const scheduleBtn = modal.querySelector('#schedule-btn');
                        const cancelModalBtn = modal.querySelector('#cancel-modal-btn');

                        // Set minimum date to today
                        const today = new Date().toISOString().split('T')[0];
                        dateInput.min = today;

                        scheduleBtn.addEventListener('click', () => {
                            if (!dateInput.value || !timeInput.value) {
                                alert('Please select a date and time');
                                return;
                            }

                            const scheduledTime = new Date(`${dateInput.value}T${timeInput.value}`);
                            
                            if (scheduledTime <= new Date()) {
                                alert('Please select a future date and time');
                                return;
                            }

                            ipcRenderer.send('schedule-note-notification', { 
                                noteId: noteId, 
                                scheduledTime: scheduledTime.toISOString() 
                            });

                            closeModalWithAnimation();
                        });

                        cancelModalBtn.addEventListener('click', closeModalWithAnimation);
                    }, 300); 
                });

                cancelBtn.addEventListener('click', () => {
                    // Confirm cancellation
                    const confirmCancel = confirm('Are you sure you want to cancel this notification?');
                    if (confirmCancel) {
                        ipcRenderer.send('cancel-note-notification', noteId);
                        closeModalWithAnimation();
                    }
                });
            } else {
                const dateInput = modal.querySelector('#notification-date');
                const timeInput = modal.querySelector('#notification-time');
                const scheduleBtn = modal.querySelector('#schedule-btn');
                const cancelModalBtn = modal.querySelector('#cancel-modal-btn');

                // Set minimum date to today
                const today = new Date().toISOString().split('T')[0];
                dateInput.min = today;

                scheduleBtn.addEventListener('click', () => {
                    if (!dateInput.value || !timeInput.value) {
                        alert('Please select a date and time');
                        return;
                    }

                    const scheduledTime = new Date(`${dateInput.value}T${timeInput.value}`);
                    
                    if (scheduledTime <= new Date()) {
                        alert('Please select a future date and time');
                        return;
                    }

                    ipcRenderer.send('schedule-note-notification', { 
                        noteId: noteId, 
                        scheduledTime: scheduledTime.toISOString() 
                    });

                    closeModalWithAnimation();
                });

                cancelModalBtn.addEventListener('click', closeModalWithAnimation);
            }

            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModalWithAnimation();
                }
            });
        })
        .catch(error => {
            console.error('Error loading note data:', error);
            alert('Unable to load note data.');
            document.body.removeChild(modal);
        });
}

function hasScheduledNotification(noteData) {
    return noteData.notification && 
           noteData.notification.scheduled && 
           noteData.notification.scheduledTime && 
           new Date(noteData.notification.scheduledTime) > new Date();
}

function confirmAndDeleteNote(noteId, isPinned) {
    if (confirm('Are you sure you want to delete this note?')) {
        ipcRenderer.send('delete-note', noteId);
        
        // If the note is pinned, remove it from pinned notes
        if (isPinned) {
            removePinnedNote(noteId);
        }
    }
}

// Auxiliary functions for text processing
function stripHtml(html) {
    // Creates a temporary element
    const temp = document.createElement('div');
    
    const htmlWithLineBreaks = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/p>/gi, '\n');
    
    temp.innerHTML = htmlWithLineBreaks;
    
    // Returns only the text
    return temp.textContent || temp.innerText || '';
}

function extractTitle(text) {

    if (!text || text.trim().length === 0) {
        return 'Untitled Note';
    }

    const lines = text.split('\n');

    let title = 'Untitled Note';
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length > 0) {
            title = trimmedLine.replace(/<[^>]*>/g, '');
            break;
        }
    }

    // Title limit
    if (title.length > 40) {
        title = title.substring(0, 40) + '...';
    }

    return title;
}

function extractPreview(text, title, maxLength) {
    // If empty, return the image
    if (!text || text.trim().length === 0) {
        return 'No content';
    }
  
    const lines = text.split('\n');
    
    // Find the first line (title)
    let titleIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
            titleIndex = i;
            break;
        }
    }
    
    // Search for content after the title
    let previewText = 'No additional content';
    const contentLines = [];
    
    // Collect all non-empty lines after the title
    for (let i = titleIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 0) {
            contentLines.push(line);
        }
    }
    
    // If we found content after the title
    if (contentLines.length > 0) {
        // Use <br> tags to preserve line breaks instead of joining with spaces
        previewText = contentLines.join('<br>').replace(/<(?!br>)[^>]*>/g, '');
        
        // Limit the preview length
        if (previewText.length > maxLength) {
            // Try to cut at the end of a sentence or word
            let cutPoint = previewText.substring(0, maxLength).lastIndexOf('. ');
            
            if (cutPoint === -1 || cutPoint < maxLength / 2) {
                cutPoint = previewText.substring(0, maxLength).lastIndexOf(' ');
            }
            
            if (cutPoint === -1 || cutPoint < maxLength / 2) {
                cutPoint = maxLength;
            }

            previewText = previewText.substring(0, cutPoint) + '...';
        }
    }

    return previewText;
}

function formatDate(date) {
    // Check if the date is valid
    if (isNaN(date.getTime())) {
        return 'Unknown date';
    }
    
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    // If its today
    if (diffDays === 0) {
        return `Today at ${timeStr}`;
    }
    
    // If it's yesterday
    if (diffDays === 1) {
        return `Yesterday at ${timeStr}`;
    }
    
    // If it was in the last 7 days
    if (diffDays < 7) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `${days[date.getDay()]} às ${timeStr}`;
    }
    
    // Otherwise, show the full date
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
}

function countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
}

function isLightColor(color) {
    // Converts the color to RGB if it's in hex format
    let r, g, b;
    
    if (color.startsWith('#')) {
        const hex = color.substring(1);
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
    } else if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        r = parseInt(rgb[0]);
        g = parseInt(rgb[1]);
        b = parseInt(rgb[2]);
    } else {
        return true; // Assume light colors by default
        }
        
        // Calculate the color's luminance (standard formula)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5; // If > 0.5, it's a light color
}