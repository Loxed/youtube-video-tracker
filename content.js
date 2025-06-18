class YouTubeCourseTracker {
  constructor() {
    this.videoId = null;
    this.courseData = null;
    this.currentChapter = 0;
    this.sessionStartTime = Date.now();
    this.lastProgressUpdate = 0;
    this.progressUI = null;
    
    this.init();
  }

  init() {
    console.log('YouTubeCourseTracker initializing...');
    this.videoId = this.extractVideoId(window.location.href);
    console.log('Video ID:', this.videoId);
    
    if (this.videoId) {
      // Add delay to ensure YouTube page is fully loaded
      setTimeout(() => {
        this.loadCourseData();
        this.setupVideoListeners();
        this.createProgressUI();
      }, 2000);
    }
    
    // Listen for URL changes (YouTube is a SPA)
    this.setupURLChangeListener();
  }

  extractVideoId(url) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }

  async loadCourseData() {
    console.log('Loading video data...');
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    this.courseData = courses[this.videoId];
    
    console.log('Video data:', this.courseData);
    
    if (this.courseData) {
      console.log('Video is tracked, showing progress UI');
      this.updateSessionCount();
      this.showProgressUI();
    } else {
      console.log('Video not tracked yet, showing add bubble');
      this.showAddBubble();
    }
  }

  async updateSessionCount() {
    if (!this.courseData) return;
    
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    
    if (courses[this.videoId]) {
      courses[this.videoId].sessions += 1;
      courses[this.videoId].lastWatched = new Date().toISOString();
      await browser.storage.local.set({ courses });
      this.courseData = courses[this.videoId];
    }
  }

  setupVideoListeners() {
    const video = document.querySelector('video');
    if (!video) {
      // Retry after a short delay
      setTimeout(() => this.setupVideoListeners(), 1000);
      return;
    }

    video.addEventListener('timeupdate', () => this.handleTimeUpdate(video));
    video.addEventListener('loadedmetadata', () => this.handleVideoLoaded(video));
  }

  async handleTimeUpdate(video) {
    if (!this.courseData || !this.courseData.chapters.length) return;
    
    const currentTime = video.currentTime;
    const now = Date.now();
    
    // Update total watch time (throttled to once per second)
    if (now - this.lastProgressUpdate > 1000) {
      await this.updateWatchTime();
      this.lastProgressUpdate = now;
    }
    
    // Update current chapter based on timestamp
    this.updateCurrentChapter(currentTime);
    
    // Update chapter progress
    this.updateChapterProgress(currentTime);
  }

  async handleVideoLoaded(video) {
    if (!this.courseData) return;
    
    // Update the duration of the last chapter if it wasn't set
    const lastChapter = this.courseData.chapters[this.courseData.chapters.length - 1];
    if (lastChapter && lastChapter.duration === null) {
      lastChapter.duration = video.duration - lastChapter.seconds;
      await this.saveCourseData();
    }
  }

  updateCurrentChapter(currentTime) {
    if (!this.courseData.chapters.length) return;
    
    for (let i = this.courseData.chapters.length - 1; i >= 0; i--) {
      if (currentTime >= this.courseData.chapters[i].seconds) {
        if (this.currentChapter !== i) {
          const previousChapter = this.currentChapter;
          this.currentChapter = i;
          this.updateProgressUI();
          
          // Scroll to the new current chapter with smooth animation
          this.scrollToCurrentChapter(previousChapter, i);
        }
        break;
      }
    }
  }
  
  scrollToCurrentChapter(previousChapter, newChapter) {
    if (!this.progressUI) return;
    
    // Find the chapter list container
    const chapterList = this.progressUI.querySelector('.course-tracker-chapter-list');
    if (!chapterList) return;
    
    // Find the new current chapter element
    const newChapterElement = chapterList.querySelector(`[data-chapter="${newChapter}"]`);
    if (!newChapterElement) return;
    
    // Check if the progress tracker content is visible
    const content = this.progressUI.querySelector('.course-tracker-content');
    if (!content || content.style.display === 'none') return;
    
    // Get the container bounds
    const containerRect = chapterList.getBoundingClientRect();
    const chapterRect = newChapterElement.getBoundingClientRect();
    
    // Check if the chapter is already fully visible
    const isVisible = chapterRect.top >= containerRect.top && 
                     chapterRect.bottom <= containerRect.bottom;
    
    if (!isVisible) {
      // Calculate the scroll position to put the chapter at the top
      const chapterTop = newChapterElement.offsetTop;
      const currentScrollTop = chapterList.scrollTop;
      
      // Position the chapter at the top of the container
      const targetScrollTop = chapterTop;
      
      // Smooth scroll animation with easing
      this.smoothScrollTo(chapterList, currentScrollTop, targetScrollTop, 600);
      
      console.log(`Scrolling chapter ${newChapter} to top (from ${previousChapter})`);
    }
  }
  
  smoothScrollTo(element, startPos, endPos, duration) {
    const startTime = performance.now();
    const distance = endPos - startPos;
    
    // Easing function (ease-out cubic)
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    
    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Apply easing
      const easedProgress = easeOutCubic(progress);
      const currentPos = startPos + (distance * easedProgress);
      
      element.scrollTop = currentPos;
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };
    
    requestAnimationFrame(animateScroll);
  }

  async updateChapterProgress(currentTime) {
    if (!this.courseData.chapters.length) return;
    
    const chapter = this.courseData.chapters[this.currentChapter];
    if (!chapter) return;
    
    const chapterProgress = currentTime - chapter.seconds;
    const chapterDuration = chapter.duration || 0;
    
    if (chapterDuration > 0) {
      const progressPercentage = Math.min(chapterProgress / chapterDuration, 1);
      
      console.log(`Chapter ${this.currentChapter} progress: ${(progressPercentage * 100).toFixed(1)}% (${chapterProgress.toFixed(1)}s / ${chapterDuration.toFixed(1)}s)`);
      
      // Mark chapter as completed if within last 2 seconds of chapter
      const remainingTime = chapterDuration - chapterProgress;
      if (remainingTime <= 1 && !this.courseData.progress[this.currentChapter].completed) {
        console.log(`Chapter ${this.currentChapter} completed!`);
        this.courseData.progress[this.currentChapter].completed = true;
        await this.saveCourseData();
        this.updateProgressUI();
      }
      
      // Update watch time for current chapter
      this.courseData.progress[this.currentChapter].watchTime = Math.max(
        this.courseData.progress[this.currentChapter].watchTime,
        chapterProgress
      );
    } else {
      console.log(`Chapter ${this.currentChapter} has no duration set`);
    }
  }

  async updateWatchTime() {
    if (!this.courseData) return;
    
    // Only count actual watch time (when video is playing)
    const video = document.querySelector('video');
    if (video && !video.paused && !video.ended) {
      this.courseData.totalWatchTime += 1; // Add 1 second
      console.log('Watch time updated:', this.courseData.totalWatchTime, 'seconds');
      await this.saveCourseData();
      
      // Update UI to show real-time changes
      if (this.progressUI && this.progressUI.style.display !== 'none') {
        this.updateProgressUI();
      }
    }
  }

  async saveCourseData() {
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    courses[this.videoId] = this.courseData;
    await browser.storage.local.set({ courses });
  }

  createProgressUI() {
    if (this.progressUI) return;
    
    console.log('Creating progress UI...');
    
    this.progressUI = document.createElement('div');
    this.progressUI.id = 'course-tracker-ui';
    this.progressUI.innerHTML = `
      <div class="course-tracker-container">
        <div class="course-tracker-header">
          <span class="course-tracker-title"><img src="${browser.runtime.getURL('icons/book.svg')}" width="16" height="16" style="vertical-align: middle; margin-right: 6px;">Video Progress</span>
          <div class="course-tracker-actions">
            <button class="course-tracker-import" title="Import/Edit chapters"><img src="${browser.runtime.getURL('icons/manual.svg')}" width="14" height="14"></button>
            <button class="course-tracker-add-remove" title="Add/Remove from tracking"></button>
            <button class="course-tracker-toggle"><img src="${browser.runtime.getURL('icons/minus.svg')}" width="14" height="14"></button>
          </div>
        </div>
        <div class="course-tracker-content">
          <div class="course-tracker-chapters"></div>
        </div>
      </div>
    `;
    
    // Try to insert in the right sidebar above video suggestions
    const sidebarTargets = [
      '#secondary-inner',
      '#secondary',
      '.ytd-watch-flexy #secondary',
      '#related'
    ];
    
    let inserted = false;
    for (const selector of sidebarTargets) {
      const target = document.querySelector(selector);
      if (target) {
        console.log(`Inserting progress UI into sidebar: ${selector}`);
        target.insertBefore(this.progressUI, target.firstChild);
        inserted = true;
        break;
      }
    }
    
    // Fallback to primary content area
    if (!inserted) {
      const primaryTargets = [
        '#primary-inner',
        '#primary', 
        '#columns',
        '#content'
      ];
      
      for (const selector of primaryTargets) {
        const target = document.querySelector(selector);
        if (target) {
          console.log(`Inserting progress UI into primary: ${selector}`);
          target.insertBefore(this.progressUI, target.firstChild);
          inserted = true;
          break;
        }
      }
    }
    
    if (!inserted) {
      console.warn('Could not find suitable insertion point for progress UI');
      document.body.appendChild(this.progressUI);
    }
    
    this.setupProgressUIListeners();
  }

  showAddBubble() {
    // Remove any existing UI
    this.removeAllUI();
    
    const addBubble = document.createElement('div');
    addBubble.id = 'course-tracker-add-bubble';
    addBubble.innerHTML = `<img src="${browser.runtime.getURL('icons/add.svg')}" width="24" height="24">`;
    addBubble.title = 'Add to Video Tracker';
    addBubble.style.cssText = `
      position: fixed;
      top: 50%;
      right: 20px;
      width: 50px;
      height: 50px;
      background: #ff0000;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
    `;
    
    addBubble.addEventListener('mouseenter', () => {
      addBubble.style.transform = 'scale(1.1)';
      addBubble.style.background = '#cc0000';
    });
    
    addBubble.addEventListener('mouseleave', () => {
      addBubble.style.transform = 'scale(1)';
      addBubble.style.background = '#ff0000';
    });
    
    addBubble.addEventListener('click', async () => {
      await this.addVideoToTracking();
    });
    
    document.body.appendChild(addBubble);
    console.log('Add bubble created');
  }

  removeAllUI() {
    // Remove progress UI
    if (this.progressUI) {
      this.progressUI.remove();
      this.progressUI = null;
    }
    
    // Remove add bubble
    const existingBubble = document.getElementById('course-tracker-add-bubble');
    if (existingBubble) {
      existingBubble.remove();
    }
  }

  showNotTrackedMessage() {
    if (!this.progressUI) return;
    
    const chaptersContainer = this.progressUI.querySelector('.course-tracker-chapters');
    if (chaptersContainer) {
      chaptersContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666;">
          <p><strong>Debug Info:</strong></p>
          <p>Video ID: ${this.videoId}</p>
          <p>Course Data: ${this.courseData ? 'Found' : 'Not found'}</p>
          <p>This video's progress is not being tracked.</p>
          <p>Click the extension icon in your browser toolbar and select "Track Video" to start tracking your progress!</p>
          <button onclick="console.log('Current video data:', ${JSON.stringify(this.courseData)})" style="margin-top: 10px; padding: 5px 10px;">Log Debug Info</button>
        </div>
      `;
    }
  }

  async showProgressUI() {
    // Remove add bubble if it exists
    this.removeAllUI();
    
    // Create progress UI
    this.createProgressUI();
    
    if (!this.progressUI || !this.courseData) return;
    
    this.progressUI.style.display = 'block';
    
    // Load saved minimization state
    const result = await browser.storage.local.get([`progressWindowState_${this.videoId}`]);
    const savedState = result[`progressWindowState_${this.videoId}`] || 'collapsed'; // Default to collapsed
    
    const content = this.progressUI.querySelector('.course-tracker-content');
    const toggleButton = this.progressUI.querySelector('.course-tracker-toggle');
    if (content && toggleButton) {
      if (savedState === 'expanded') {
        content.style.display = 'block';
        toggleButton.innerHTML = `<img src="${browser.runtime.getURL('icons/minus.svg')}" width="14" height="14">`;
      } else {
        content.style.display = 'none';
        toggleButton.innerHTML = `<img src="${browser.runtime.getURL('icons/plus.svg')}" width="14" height="14">`;
      }
    }
    
    this.updateProgressUI();
  }

  updateProgressUI() {
    if (!this.progressUI || !this.courseData) return;
    
    const chaptersContainer = this.progressUI.querySelector('.course-tracker-chapters');
    if (!chaptersContainer) return;
    
    // Check if we need to build the initial structure
    let statsElement = chaptersContainer.querySelector('.course-tracker-stats');
    let chapterListElement = chaptersContainer.querySelector('.course-tracker-chapter-list');
    
    if (!statsElement || !chapterListElement) {
      // First time - build the full structure
      this.buildInitialProgressUI();
      return;
    }
    
    // Update only the dynamic parts to preserve scroll position
    const completedChapters = Object.values(this.courseData.progress).filter(p => p.completed).length;
    const totalChapters = this.courseData.chapters.length;
    
    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    // Update stats only
    statsElement.innerHTML = `
      <span>Progress: ${completedChapters}/${totalChapters} chapters</span>
      <span>Watch time: ${formatTime(this.courseData.totalWatchTime)}</span>
      <span>Sessions: ${this.courseData.sessions}</span>
    `;
    
    // Update individual chapter progress without rebuilding the list
    const video = document.querySelector('video');
    const currentTime = video ? video.currentTime : 0;
    
    this.courseData.chapters.forEach((chapter, index) => {
      const chapterElement = chapterListElement.querySelector(`[data-chapter="${index}"]`);
      if (!chapterElement) return;
      
      const progress = this.courseData.progress[index];
      // More conservative progress calculation - only show 100% when truly completed
      const progressPercentage = chapter.duration && progress ? 
        Math.min(Math.floor((progress.watchTime / chapter.duration) * 100), progress.completed ? 100 : 99) : 0;
      
      const isCurrentChapter = index === this.currentChapter;
      const videoPositionInChapter = isCurrentChapter ? 
        Math.min(((currentTime - chapter.seconds) / chapter.duration) * 100, 100) : 0;
      
      // Update chapter classes
      chapterElement.className = `course-tracker-chapter ${isCurrentChapter ? 'current' : ''} ${progress?.completed ? 'completed' : ''}`;
      
      // Update timestamp with current time in chapter
      const timestampElement = chapterElement.querySelector('.chapter-timestamp');
      if (timestampElement) {
        let timestampText = chapter.timestamp;
        
        if (isCurrentChapter && chapter.duration) {
          const currentTimeInChapter = Math.max(0, currentTime - chapter.seconds);
          const currentTimeFormatted = formatTime(currentTimeInChapter);
          timestampText += ` (<span style="color: #ff0000;">${currentTimeFormatted}</span> : ${formatTime(chapter.duration)})`;
        } else if (chapter.duration) {
          timestampText += ` (${formatTime(chapter.duration)})`;
        }
        
        timestampElement.innerHTML = timestampText;
      }
      
      // Update progress bar if it exists
      const progressFill = chapterElement.querySelector('.chapter-progress-fill');
      const progressText = chapterElement.querySelector('.chapter-progress-text');
      const progressBar = chapterElement.querySelector('.chapter-progress-bar');
      
      if (progressFill && progressText) {
        // Force 100% for completed chapters, otherwise use calculated percentage
        const displayPercentage = progress?.completed ? 100 : progressPercentage;
        progressFill.style.width = `${displayPercentage}%`;
        progressText.textContent = `${Math.floor(displayPercentage)}%`;
        
        // Change color to YouTube red for completed chapters, default red for incomplete
        progressFill.style.background = '#ff0000';
        
        // Update gap indicator only (no red circle)
        let gapElement = progressBar.querySelector('.chapter-progress-gap');
        
        if (isCurrentChapter && videoPositionInChapter > progressPercentage) {
          if (!gapElement) {
            gapElement = document.createElement('div');
            gapElement.className = 'chapter-progress-gap';
            progressBar.appendChild(gapElement);
          }
          
          gapElement.style.left = `${progressPercentage}%`;
          gapElement.style.width = `${videoPositionInChapter - progressPercentage}%`;
        } else {
          // Remove gap indicator if not needed
          if (gapElement) gapElement.remove();
        }
        
      }
      
      // Update status button
      const statusElement = chapterElement.querySelector('.chapter-status');
      if (statusElement) {
        const img = statusElement.querySelector('img');
        if (progress?.completed) {
          statusElement.innerHTML = `<img src="${browser.runtime.getURL('icons/check.svg')}" width="12" height="12">`;
          // Remove any existing hover event listeners for completed chapters
          statusElement.replaceWith(statusElement.cloneNode(true));
        } else {
          statusElement.innerHTML = `<img src="${browser.runtime.getURL('icons/circle.svg')}" width="12" height="12">`;
          
          // Add hover effect for incomplete chapters only
          const imgElement = statusElement.querySelector('img');
          statusElement.addEventListener('mouseenter', () => {
            imgElement.src = browser.runtime.getURL('icons/hover-circle.svg');
          });
          statusElement.addEventListener('mouseleave', () => {
            imgElement.src = browser.runtime.getURL('icons/circle.svg');
          });
        }
        
        // Make it look clickable for incomplete chapters
        if (!progress?.completed) {
          statusElement.title = 'Click to mark chapter as complete and move to next';
          statusElement.classList.add('clickable');
        } else {
          statusElement.title = 'Chapter completed';
          statusElement.classList.remove('clickable');
        }
      }
    });
  }

  buildInitialProgressUI() {
    const chaptersContainer = this.progressUI.querySelector('.course-tracker-chapters');
    if (!chaptersContainer) return;
    
    const completedChapters = Object.values(this.courseData.progress).filter(p => p.completed).length;
    const totalChapters = this.courseData.chapters.length;
    
    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    chaptersContainer.innerHTML = `
      <div class="course-tracker-stats">
        <span>Progress: ${completedChapters}/${totalChapters} chapters</span>
        <span>Watch time: ${formatTime(this.courseData.totalWatchTime)}</span>
        <span>Sessions: ${this.courseData.sessions}</span>
      </div>
      <div class="course-tracker-chapter-list">
        ${this.courseData.chapters.map((chapter, index) => {
          const progress = this.courseData.progress[index];
          // More conservative progress calculation - only show 100% when truly completed
          const progressPercentage = chapter.duration && progress ? 
            Math.min(Math.floor((progress.watchTime / chapter.duration) * 100), progress.completed ? 100 : 99) : 0;
          
          // Calculate actual watch percentage vs video position for gap visualization
          const video = document.querySelector('video');
          const currentTime = video ? video.currentTime : 0;
          const isCurrentChapter = index === this.currentChapter;
          const videoPositionInChapter = isCurrentChapter ? 
            Math.min(((currentTime - chapter.seconds) / chapter.duration) * 100, 100) : 0;
          
          return `
            <div class="course-tracker-chapter ${isCurrentChapter ? 'current' : ''} ${progress?.completed ? 'completed' : ''}" 
                 data-chapter="${index}">
              <div class="chapter-info">
                <span class="chapter-title">${chapter.title}</span>
                <span class="chapter-timestamp">${chapter.timestamp}${chapter.duration ? ` (${formatTime(chapter.duration)})` : ''}</span>
                ${chapter.duration ? 
                  `<div class="chapter-progress-container">
                     <div class="chapter-progress-bar">
                       <div class="chapter-progress-fill" style="width: ${progressPercentage}%"></div>
                       ${isCurrentChapter && videoPositionInChapter > progressPercentage ? 
                         `<div class="chapter-progress-gap" style="left: ${progressPercentage}%; width: ${videoPositionInChapter - progressPercentage}%"></div>` : ''}
                     </div>
                     <div class="chapter-progress-text">${progressPercentage.toFixed(0)}%</div>
                   </div>` : ''}
              </div>
              <div class="chapter-actions">
                <button class="chapter-status ${!progress?.completed ? 'clickable' : ''}" title="${!progress?.completed ? 'Click to mark chapter as complete and move to next' : 'Chapter completed'}" 
                        ${!progress?.completed ? `onmouseenter="this.querySelector('img').src='${browser.runtime.getURL('icons/hover-circle.svg')}'" onmouseleave="this.querySelector('img').src='${browser.runtime.getURL('icons/circle.svg')}'"` : ''}>
                  ${progress?.completed ? `<img src="${browser.runtime.getURL('icons/check.svg')}" width="12" height="12">` : `<img src="${browser.runtime.getURL('icons/circle.svg')}" width="12" height="12">`}
                </button>
                <button class="chapter-reset-btn" data-chapter="${index}" title="Reset chapter progress">
                  <img src="${browser.runtime.getURL('icons/reset.svg')}" width="12" height="12">
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  setupProgressUIListeners() {
    if (!this.progressUI) return;
    
    // Toggle visibility
    const toggleButton = this.progressUI.querySelector('.course-tracker-toggle');
    const content = this.progressUI.querySelector('.course-tracker-content');
    const addRemoveButton = this.progressUI.querySelector('.course-tracker-add-remove');
    const importButton = this.progressUI.querySelector('.course-tracker-import');
    
    // Update add/remove button based on tracking status
    this.updateAddRemoveButton();
    
    // Update import button based on chapter status
    this.updateImportButton();
    
    toggleButton.addEventListener('click', async () => {
      const isVisible = content.style.display !== 'none';
      const newState = isVisible ? 'collapsed' : 'expanded';
      
      content.style.display = isVisible ? 'none' : 'block';
      toggleButton.innerHTML = isVisible ? `<img src="${browser.runtime.getURL('icons/plus.svg')}" width="14" height="14">` : `<img src="${browser.runtime.getURL('icons/minus.svg')}" width="14" height="14">`;
      
      // Save the state to storage
      await browser.storage.local.set({ 
        [`progressWindowState_${this.videoId}`]: newState 
      });
      console.log(`Progress window ${newState} for video ${this.videoId}`);
    });
    
    // Add/Remove tracking button
    addRemoveButton.addEventListener('click', () => {
      this.toggleVideoTracking();
    });
    
    // Import chapters button
    if (importButton) {
      importButton.addEventListener('click', () => {
        this.showManualChapterImport();
      });
    }
    
    // Chapter navigation, reset buttons, and status buttons
    this.progressUI.addEventListener('click', (e) => {
      if (e.target.classList.contains('chapter-reset-btn') || e.target.closest('.chapter-reset-btn')) {
        e.stopPropagation();
        e.preventDefault();
        const resetBtn = e.target.classList.contains('chapter-reset-btn') ? e.target : e.target.closest('.chapter-reset-btn');
        const chapterIndex = parseInt(resetBtn.dataset.chapter);
        this.resetChapter(chapterIndex);
      } else if (e.target.closest('.chapter-status')) {
        e.stopPropagation();
        e.preventDefault();
        const chapterElement = e.target.closest('.course-tracker-chapter');
        if (chapterElement) {
          const chapterIndex = parseInt(chapterElement.dataset.chapter);
          this.toggleChapterCompletion(chapterIndex);
        }
      } else {
        const chapterElement = e.target.closest('.course-tracker-chapter');
        if (chapterElement && !e.target.closest('.chapter-reset-btn') && !e.target.closest('.chapter-status')) {
          const chapterIndex = parseInt(chapterElement.dataset.chapter);
          this.jumpToChapter(chapterIndex);
        }
      }
    });
  }

  jumpToChapter(chapterIndex) {
    const video = document.querySelector('video');
    const chapter = this.courseData.chapters[chapterIndex];
    const progress = this.courseData.progress[chapterIndex];
    
    if (video && chapter) {
      // If chapter is completed or has no progress, go to beginning
      // Otherwise, go to where you left off (watchTime position)
      let targetTime = chapter.seconds;
      
      if (progress && !progress.completed && progress.watchTime > 0) {
        // Jump to where you left off within the chapter
        targetTime = chapter.seconds + progress.watchTime;
        console.log(`Jumping to chapter ${chapterIndex} at ${progress.watchTime}s into chapter (${targetTime}s total)`);
      } else {
        console.log(`Jumping to beginning of chapter ${chapterIndex} (${targetTime}s)`);
      }
      
      video.currentTime = targetTime;
      this.currentChapter = chapterIndex;
      this.updateProgressUI();
    }
  }

  async resetChapter(chapterIndex) {
    if (!this.courseData || !this.courseData.progress[chapterIndex]) return;
    
    console.log(`Resetting chapter ${chapterIndex}`);
    
    // Reset chapter progress
    this.courseData.progress[chapterIndex] = {
      completed: false,
      watchTime: 0
    };
    
    await this.saveCourseData();
    
    // If this is the current chapter, jump back to its beginning
    if (chapterIndex === this.currentChapter) {
      const video = document.querySelector('video');
      const chapter = this.courseData.chapters[chapterIndex];
      if (video && chapter) {
        video.currentTime = chapter.seconds;
        console.log(`Jumped back to beginning of current chapter ${chapterIndex} at ${chapter.seconds}s`);
      }
    }
    
    // Force immediate UI update to show 0% progress
    const chapterElement = document.querySelector(`[data-chapter="${chapterIndex}"]`);
    if (chapterElement) {
      const progressFill = chapterElement.querySelector('.chapter-progress-fill');
      const progressText = chapterElement.querySelector('.chapter-progress-text');
      if (progressFill && progressText) {
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
      }
    }
    
    this.updateProgressUI();
    
    // Show confirmation
    const chapterTitle = this.courseData.chapters[chapterIndex]?.title || `Chapter ${chapterIndex + 1}`;
    console.log(`Reset progress for: ${chapterTitle}`);
  }

  async toggleChapterCompletion(chapterIndex) {
    if (!this.courseData || !this.courseData.progress[chapterIndex]) return;
    
    const progress = this.courseData.progress[chapterIndex];
    const chapter = this.courseData.chapters[chapterIndex];
    
    if (!progress.completed) {
      // Mark as complete
      console.log(`Instantly completing chapter ${chapterIndex}`);
      
      progress.completed = true;
      progress.watchTime = chapter.duration || 0; // Set to full duration
      
      await this.saveCourseData();
      this.updateProgressUI();
      
      // Only move to next chapter if we're currently on the chapter being completed
      if (chapterIndex === this.currentChapter) {
        const nextChapterIndex = chapterIndex + 1;
        if (nextChapterIndex < this.courseData.chapters.length) {
          console.log(`Moving to next chapter: ${nextChapterIndex}`);
          this.jumpToChapter(nextChapterIndex);
        } else {
          console.log('Video completed! No more chapters.');
        }
      } else {
        console.log(`Chapter ${chapterIndex} completed, but staying on current chapter ${this.currentChapter}`);
      }
      
      const chapterTitle = chapter?.title || `Chapter ${chapterIndex + 1}`;
      console.log(`Completed: ${chapterTitle}`);
    }
    // If already completed, do nothing (could add uncomplete functionality here if needed)
  }

  updateAddRemoveButton() {
    const addRemoveButton = this.progressUI?.querySelector('.course-tracker-add-remove');
    if (!addRemoveButton) return;
    
    if (this.courseData) {
      // Video is tracked - show remove button
      addRemoveButton.innerHTML = `<img src="${browser.runtime.getURL('icons/remove.svg')}" width="14" height="14">`;
      addRemoveButton.title = 'Remove from tracking';
    } else {
      // Video is not tracked - show add button
      addRemoveButton.innerHTML = `<img src="${browser.runtime.getURL('icons/add.svg')}" width="14" height="14">`;
      addRemoveButton.title = 'Add to tracking';
    }
  }
  
  updateImportButton() {
    const importButton = this.progressUI?.querySelector('.course-tracker-import');
    if (!importButton) return;
    
    const hasExistingChapters = this.courseData && this.courseData.chapters && this.courseData.chapters.length > 0;
    
    if (hasExistingChapters) {
      // Has chapters - show edit icon
      importButton.innerHTML = `<img src="${browser.runtime.getURL('icons/edit.svg')}" width="14" height="14">`;
      importButton.title = 'Edit chapters';
    } else {
      // No chapters - show manual import icon
      importButton.innerHTML = `<img src="${browser.runtime.getURL('icons/manual.svg')}" width="14" height="14">`;
      importButton.title = 'Import chapters manually';
    }
  }

  async addVideoToTracking() {
    // Get video data
    const videoData = await this.getVideoDataForTracking();
    if (videoData) {
      const result = await browser.storage.local.get(['courses']);
      const courses = result.courses || {};
      
      const chapters = this.parseChapters(videoData.description);
      courses[this.videoId] = {
        title: videoData.title,
        description: videoData.description,
        chapters: chapters,
        manualChapters: null, // Will store manually imported chapters
        totalWatchTime: 0,
        sessions: 1,
        progress: {},
        dateAdded: new Date().toISOString(),
        lastWatched: new Date().toISOString()
      };
      
      // Initialize progress for each chapter
      chapters.forEach((chapter, index) => {
        courses[this.videoId].progress[index] = {
          completed: false,
          watchTime: 0
        };
      });
      
      await browser.storage.local.set({ courses });
      this.courseData = courses[this.videoId];
      console.log('Video added to tracking');
      
      // If no chapters found, automatically open import dialog
      if (chapters.length === 0) {
        console.log('No chapters found, opening manual import dialog');
        setTimeout(() => {
          this.showManualChapterImport();
        }, 500);
      }
      
      // Show progress UI (minimized)
      this.showProgressUI();
    }
  }

  async toggleVideoTracking() {
    if (this.courseData) {
      // Remove from tracking - show confirmation prompt
      const courseTitle = this.courseData.title || 'this video';
      
      // Check if user has disabled confirmation
      const result = await browser.storage.local.get(['skipRemoveConfirmation']);
      const skipConfirmation = result.skipRemoveConfirmation || false;
      
      if (skipConfirmation) {
        // Skip confirmation and remove directly
        const courses = (await browser.storage.local.get(['courses'])).courses || {};
        delete courses[this.videoId];
        await browser.storage.local.set({ courses });
        
        this.courseData = null;
        console.log('Video removed from tracking');
        
        // Show add bubble
        this.showAddBubble();
        return;
      }
      
      // Show custom confirmation dialog
      const confirmed = await this.showRemoveConfirmation(courseTitle);
      if (confirmed) {
        const courses = (await browser.storage.local.get(['courses'])).courses || {};
        delete courses[this.videoId];
        await browser.storage.local.set({ courses });
        
        this.courseData = null;
        console.log('Video removed from tracking');
        
        // Show add bubble
        this.showAddBubble();
      }
    } else {
      // Add to tracking
      await this.addVideoToTracking();
    }
  }
  
  async showRemoveConfirmation(courseTitle) {
    return new Promise((resolve) => {
      // Create modal overlay
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      // Create modal content with theme support
      const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: ${isDarkMode ? '#2a2a2a' : 'white'};
        border-radius: 8px;
        padding: 20px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        border: ${isDarkMode ? '1px solid #444' : 'none'};
      `;
      
      modalContent.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: ${isDarkMode ? '#e0e0e0' : '#333'};">Remove Video</h3>
        <p style="color: ${isDarkMode ? '#ccc' : '#666'}; font-size: 14px; margin-bottom: 20px;">
          Are you sure you want to remove "<strong style="color: ${isDarkMode ? '#fff' : '#333'};">${courseTitle}</strong>" from tracking? 
          This will also delete any manually imported chapters and all progress data.
        </p>
        <div style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${isDarkMode ? '#ccc' : '#666'}; cursor: pointer;">
            <input type="checkbox" id="dont-show-again-content" style="margin: 0; accent-color: #ff0000;">
            Don't show this confirmation again
          </label>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-remove-content" style="
            padding: 8px 16px;
            border: 1px solid ${isDarkMode ? '#555' : '#ddd'};
            background: ${isDarkMode ? '#333' : 'white'};
            color: ${isDarkMode ? '#e0e0e0' : '#333'};
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='${isDarkMode ? '#444' : '#f5f5f5'}'" onmouseout="this.style.background='${isDarkMode ? '#333' : 'white'}'">Cancel</button>
          <button id="confirm-remove-content" style="
            padding: 8px 16px;
            border: none;
            background: #ff0000;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='#cc0000'" onmouseout="this.style.background='#ff0000'">Remove Video</button>
        </div>
      `;
      
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      const cancelBtn = document.getElementById('cancel-remove-content');
      const confirmBtn = document.getElementById('confirm-remove-content');
      const dontShowAgain = document.getElementById('dont-show-again-content');
      
      // Cancel button
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
      
      // Confirm button
      confirmBtn.addEventListener('click', async () => {
        // Save "don't show again" preference
        if (dontShowAgain.checked) {
          await browser.storage.local.set({ skipRemoveConfirmation: true });
        }
        
        document.body.removeChild(modal);
        resolve(true);
      });
      
      // Close on overlay click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
          resolve(false);
        }
      });
    });
  }

  parseChapters(description) {
    console.log('=== CHAPTER PARSING DEBUG ===');
    console.log('Raw description length:', description.length);
    console.log('Raw description preview:', description.substring(0, 500));
    
    const chapters = [];
    const lines = description.split('\n');
    console.log('Description split into', lines.length, 'lines');
    
    // Enhanced regex to match various timestamp formats:
    // - 0:00, 1:23, 12:34 (m:ss or mm:ss)
    // - 1:23:45 (h:mm:ss)
    // - (0:00), [1:23], {12:34} (with brackets/parentheses)
    // - 0:00:00 (h:mm:ss with leading zeros)
    const timestampRegex = /[\[\(\{]?(\d{1,2}):(\d{1,2}):(\d{2})[\]\)\}]?|[\[\(\{]?(\d{1,2}):(\d{2})[\]\)\}]?/g;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      const matches = [...trimmedLine.matchAll(timestampRegex)];
      
      if (matches.length > 0) {
        console.log(`Line ${i}: "${trimmedLine}" -> Found ${matches.length} timestamp(s)`);
        for (const match of matches) {
          let hours = 0, minutes = 0, seconds = 0;
          let fullMatch = match[0];
          
          if (match[1] && match[2] && match[3]) {
            // Format: h:mm:ss or hh:mm:ss
            hours = parseInt(match[1]);
            minutes = parseInt(match[2]);
            seconds = parseInt(match[3]);
          } else if (match[4] && match[5]) {
            // Format: m:ss or mm:ss
            minutes = parseInt(match[4]);
            seconds = parseInt(match[5]);
          }
          
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          // Extract title by removing timestamp and common prefixes
          let title = trimmedLine.replace(fullMatch, '').trim();
          
          // Remove common chapter prefixes
          title = title.replace(/^[-–—•*]\s*/, ''); // Remove bullet points and dashes
          title = title.replace(/^\d+\.\s*/, ''); // Remove numbered lists (1. 2. etc.)
          title = title.replace(/^Chapter\s*\d+:?\s*/i, ''); // Remove "Chapter X:"
          title = title.replace(/^Part\s*\d+:?\s*/i, ''); // Remove "Part X:"
          title = title.trim();
          
          // Only add if we have a meaningful title
          if (title && title.length > 2) {
            const chapter = {
              title: title,
              timestamp: fullMatch.replace(/[\[\(\{\]\)\}]/g, ''), // Clean timestamp
              seconds: totalSeconds
            };
            console.log('Adding chapter:', chapter);
            chapters.push(chapter);
          } else {
            console.log('Rejected chapter - title too short:', title);
          }
        }
      }
    }
    
    // Remove duplicates and sort by timestamp
    const uniqueChapters = chapters.filter((chapter, index, self) => 
      index === self.findIndex(c => c.seconds === chapter.seconds)
    );
    
    uniqueChapters.sort((a, b) => a.seconds - b.seconds);
    
    console.log('Unique chapters after deduplication:', uniqueChapters.length);
    
    // Calculate duration for each chapter
    for (let i = 0; i < uniqueChapters.length; i++) {
      if (i < uniqueChapters.length - 1) {
        uniqueChapters[i].duration = uniqueChapters[i + 1].seconds - uniqueChapters[i].seconds;
      } else {
        // For the last chapter, duration will be calculated when video duration is available
        uniqueChapters[i].duration = null;
      }
    }
    
    console.log('Final parsed chapters:', uniqueChapters);
    console.log('=== END CHAPTER PARSING DEBUG ===');
    
    return uniqueChapters;
  }

  async getVideoDataForTracking() {
    try {
      // Get title
      const titleSelectors = [
        'h1.ytd-watch-metadata yt-formatted-string',
        '#watch-headline-title',
        '.title',
        'h1.title',
        '.watch-title',
        'h1[class*="title"]',
        '.ytd-video-primary-info-renderer h1'
      ];
      
      let titleElement = null;
      for (const selector of titleSelectors) {
        titleElement = document.querySelector(selector);
        if (titleElement) break;
      }
      
      // Get description
      const descriptionSelectors = [
        '#description-text',
        '#watch-description-text',
        '.description',
        '#description',
        '.watch-description',
        '#meta-contents #description',
        '.ytd-video-secondary-info-renderer #description',
        '.ytd-expandable-video-description-body-renderer',
        '#description-inline-expander',
        'yt-formatted-string[slot="content"]'
      ];
      
      let descriptionElement = null;
      let descriptionText = '';
      
      for (const selector of descriptionSelectors) {
        descriptionElement = document.querySelector(selector);
        if (descriptionElement) {
          descriptionText = descriptionElement.textContent || descriptionElement.innerText || '';
          if (descriptionText.trim()) break;
        }
      }
      
      return {
        title: titleElement ? titleElement.textContent.trim() : 'Unknown Title',
        description: descriptionText.trim()
      };
    } catch (error) {
      console.error('Error getting video data for tracking:', error);
      return null;
    }
  }

  showManualChapterImport() {
    const hasExistingChapters = this.courseData && this.courseData.chapters && this.courseData.chapters.length > 0;
    const isEditMode = hasExistingChapters;
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    // Create modal content with theme support
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: ${isDarkMode ? '#2a2a2a' : 'white'};
      border-radius: 8px;
      padding: 20px;
      width: 90%;
      max-width: 600px;
      max-height: 80%;
      overflow-y: auto;
      border: ${isDarkMode ? '1px solid #444' : 'none'};
    `;
    
    // Pre-populate with existing chapters if in edit mode
    let existingChaptersText = '';
    if (isEditMode) {
      existingChaptersText = this.courseData.chapters.map(chapter => 
        `${chapter.timestamp} ${chapter.title}`
      ).join('\n');
    }
    
    modalContent.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: ${isDarkMode ? '#e0e0e0' : '#333'};">
        ${isEditMode ? 'Edit Chapters' : 'Import Chapters Manually'}
      </h3>
      <p style="color: ${isDarkMode ? '#ccc' : '#666'}; font-size: 14px; margin-bottom: 15px;">
        ${isEditMode 
          ? 'Edit the chapters below. You can modify timestamps, titles, or remove entire lines to delete chapters:'
          : 'No chapters were found in the video description. Paste timestamps from comments or other sources:'
        }
      </p>
      ${isEditMode ? `
        <div style="margin-bottom: 15px; padding: 10px; background: ${isDarkMode ? '#1a3a4a' : '#f0f8ff'}; border-radius: 4px; border-left: 4px solid ${isDarkMode ? '#4a9eff' : '#007acc'}; color: ${isDarkMode ? '#e0e0e0' : '#333'};">
          <strong>Edit Mode:</strong> Modify existing chapters or add new ones. Remove lines to delete chapters.
        </div>
      ` : ''}
      <textarea id="chapter-input" placeholder="Paste timestamps here, for example:
0:00 Introduction
2:30 Getting Started  
5:45 Advanced Topics
10:20 Conclusion" style="
        width: 100%;
        height: 150px;
        border: 1px solid ${isDarkMode ? '#555' : '#ddd'};
        border-radius: 4px;
        padding: 10px;
        font-family: monospace;
        font-size: 13px;
        resize: vertical;
        box-sizing: border-box;
        background: ${isDarkMode ? '#333' : 'white'};
        color: ${isDarkMode ? '#e0e0e0' : '#333'};
      ">${existingChaptersText}</textarea>
      <div id="chapter-preview" style="margin: 15px 0; max-height: 200px; overflow-y: auto;"></div>
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
        <button id="cancel-import" style="
          padding: 8px 16px;
          border: 1px solid ${isDarkMode ? '#555' : '#ddd'};
          background: ${isDarkMode ? '#333' : 'white'};
          color: ${isDarkMode ? '#e0e0e0' : '#333'};
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        " onmouseover="this.style.background='${isDarkMode ? '#444' : '#f5f5f5'}'" onmouseout="this.style.background='${isDarkMode ? '#333' : 'white'}'">Cancel</button>
        <button id="import-chapters" style="
          padding: 8px 16px;
          border: none;
          background: #ff0000;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        " onmouseover="this.style.background='#cc0000'" onmouseout="this.style.background='#ff0000'" ${isEditMode ? '' : 'disabled'}>
          ${isEditMode ? 'Save Changes' : 'Import Chapters'}
        </button>
      </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Focus on textarea
    const textarea = document.getElementById('chapter-input');
    const preview = document.getElementById('chapter-preview');
    const importBtn = document.getElementById('import-chapters');
    const cancelBtn = document.getElementById('cancel-import');
    
    textarea.focus();
    
    let parsedChapters = [];
    
    // Initialize with existing chapters if in edit mode
    if (isEditMode) {
      parsedChapters = this.parseChapters(existingChaptersText);
      this.showChapterPreviewInModal(parsedChapters, preview, true);
    }
    
    // Real-time preview
    textarea.addEventListener('input', () => {
      const text = textarea.value.trim();
      if (text) {
        parsedChapters = this.parseChapters(text);
        this.showChapterPreviewInModal(parsedChapters, preview, isEditMode);
        importBtn.disabled = parsedChapters.length === 0;
      } else {
        preview.innerHTML = '';
        importBtn.disabled = !isEditMode; // In edit mode, allow saving even with no chapters (to clear all)
      }
    });
    
    // Import button
    importBtn.addEventListener('click', async () => {
      if (parsedChapters.length > 0) {
        await this.importManualChapters(parsedChapters);
        document.body.removeChild(modal);
        // Refresh the UI to show new chapters
        await this.loadCourseData();
        this.showProgressUI();
      }
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }
  
  showChapterPreviewInModal(chapters, previewElement, isEditMode = false) {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (chapters.length === 0) {
      previewElement.innerHTML = `<p style="color: ${isDarkMode ? '#999' : '#999'}; font-style: italic;">
        ${isEditMode ? 'All chapters will be removed' : 'No valid chapters detected'}
      </p>`;
      return;
    }
    
    previewElement.innerHTML = `
      <h4 style="margin: 0 0 10px 0; color: ${isDarkMode ? '#e0e0e0' : '#333'};">
        Preview (${chapters.length} chapters found):
        ${isEditMode ? `<span style="font-weight: normal; color: ${isDarkMode ? '#aaa' : '#666'}; font-size: 12px;">Click × to remove individual chapters</span>` : ''}
      </h4>
      <div style="border: 1px solid ${isDarkMode ? '#555' : '#e0e0e0'}; border-radius: 4px; background: ${isDarkMode ? '#333' : '#f9f9f9'};">
        ${chapters.map((chapter, index) => `
          <div class="chapter-preview-item" data-index="${index}" style="
            padding: 6px 10px;
            border-bottom: ${index < chapters.length - 1 ? `1px solid ${isDarkMode ? '#444' : '#eee'}` : 'none'};
            font-size: 13px;
            display: flex;
            gap: 10px;
            align-items: center;
            ${isEditMode ? 'cursor: pointer;' : ''}
            transition: background-color 0.2s;
            color: ${isDarkMode ? '#e0e0e0' : '#333'};
          " ${isEditMode ? `onmouseenter="this.style.backgroundColor='${isDarkMode ? '#444' : '#f0f0f0'}'" onmouseleave="this.style.backgroundColor='transparent'"` : ''}>
            <span style="color: ${isDarkMode ? '#aaa' : '#666'}; min-width: 50px; font-family: monospace;">${chapter.timestamp}</span>
            <span style="flex: 1; color: ${isDarkMode ? '#e0e0e0' : '#333'};">${chapter.title}</span>
            ${isEditMode ? `
              <button class="remove-chapter-btn" data-index="${index}" style="
                background: #ff4444;
                color: white;
                border: none;
                border-radius: 3px;
                width: 20px;
                height: 20px;
                font-size: 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.7;
                transition: opacity 0.2s;
              " onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.7'" title="Remove this chapter">×</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
    
    // Add click handlers for remove buttons in edit mode
    if (isEditMode) {
      previewElement.querySelectorAll('.remove-chapter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const indexToRemove = parseInt(btn.dataset.index);
          this.removeChapterFromTextarea(indexToRemove);
        });
      });
    }
  }
  
  removeChapterFromTextarea(indexToRemove) {
    const textarea = document.getElementById('chapter-input');
    if (!textarea) return;
    
    const lines = textarea.value.split('\n');
    const chapterLines = lines.filter(line => line.trim() && this.parseChapters(line.trim()).length > 0);
    
    // Remove the chapter at the specified index
    if (indexToRemove >= 0 && indexToRemove < chapterLines.length) {
      // Find the actual line index in the original textarea
      let chapterCount = 0;
      let lineToRemove = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && this.parseChapters(line).length > 0) {
          if (chapterCount === indexToRemove) {
            lineToRemove = i;
            break;
          }
          chapterCount++;
        }
      }
      
      if (lineToRemove >= 0) {
        lines.splice(lineToRemove, 1);
        textarea.value = lines.join('\n');
        
        // Trigger input event to update preview
        textarea.dispatchEvent(new Event('input'));
      }
    }
  }
  
  async importManualChapters(chapters) {
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    
    if (courses[this.videoId]) {
      courses[this.videoId].manualChapters = chapters;
      courses[this.videoId].chapters = chapters; // Use manual chapters as active chapters
      courses[this.videoId].progress = {};
      
      // Initialize progress for each manual chapter
      chapters.forEach((chapter, index) => {
        courses[this.videoId].progress[index] = {
          completed: false,
          watchTime: 0
        };
      });
      
      await browser.storage.local.set({ courses });
      this.courseData = courses[this.videoId];
      console.log(`Imported ${chapters.length} manual chapters for video ${this.videoId}`);
      
      // Update import button to show edit icon now that we have chapters
      this.updateImportButton();
    }
  }

  setupURLChangeListener() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.handleURLChange();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  handleURLChange() {
    const newVideoId = this.extractVideoId(window.location.href);
    
    if (newVideoId !== this.videoId) {
      console.log('URL changed, cleaning up and reinitializing...');
      
      // Clean up all UI
      this.removeAllUI();
      
      // Initialize for new video
      this.videoId = newVideoId;
      this.courseData = null;
      this.currentChapter = 0;
      this.sessionStartTime = Date.now();
      
      if (this.videoId) {
        setTimeout(() => {
          this.loadCourseData();
          this.setupVideoListeners();
        }, 2000); // Delay to ensure page is loaded
      }
    }
  }
}

// Initialize when page loads
console.log('Content script loaded on:', window.location.href);

function initTracker() {
  console.log('Initializing YouTube Video Tracker');
  new YouTubeCourseTracker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTracker);
} else {
  // Add a small delay even if page is already loaded
  setTimeout(initTracker, 1000);
}