class CourseTracker {
  constructor() {
    this.courses = {};
    this.currentVideoId = null;
    this.filteredCourses = {};
    this.sortBy = 'recent';
    this.searchQuery = '';
    this.init();
  }

  async init() {
    await this.loadCourses();
    await this.loadCurrentVideo();
    this.setupEventListeners();
    this.applyFiltersAndSort();
    this.renderCourses();
  }

  async loadCurrentVideo() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url && tab.url.includes('youtube.com/watch')) {
        const videoId = this.extractVideoId(tab.url);
        this.currentVideoId = videoId;
        const videoData = await this.getVideoData(tab);
        
        if (videoData) {
          this.showCurrentVideo(videoData, videoId);
        }
      }
    } catch (error) {
      console.error('Error loading current video:', error);
    }
  }

  extractVideoId(url) {
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }

  async getVideoData(tab) {
    try {
      const results = await browser.tabs.executeScript(tab.id, {
        code: `
          (() => {
            // Debug mode - try multiple selectors for title
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
              if (titleElement) {
                console.log('Found title with selector:', selector);
                break;
              }
            }
            
            // Debug mode - try multiple selectors for description
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
                console.log('Found description with selector:', selector);
                descriptionText = descriptionElement.textContent || descriptionElement.innerText || '';
                if (descriptionText.trim()) {
                  break;
                }
              }
            }
            
            // If no description found, try to click "Show more" button
            if (!descriptionText.trim()) {
              const showMoreButtons = [
                '#description-inline-expander button',
                '.ytd-text-inline-expander-renderer button',
                'button[aria-label*="Show more"]',
                'button[aria-label*="more"]'
              ];
              
              for (const selector of showMoreButtons) {
                const button = document.querySelector(selector);
                if (button) {
                  console.log('Clicking show more button:', selector);
                  button.click();
                  // Wait a bit and try again
                  setTimeout(() => {
                    for (const descSelector of descriptionSelectors) {
                      const desc = document.querySelector(descSelector);
                      if (desc && desc.textContent.trim()) {
                        descriptionText = desc.textContent.trim();
                        break;
                      }
                    }
                  }, 500);
                  break;
                }
              }
            }
            
            const result = {
              title: titleElement ? titleElement.textContent.trim() : 'Unknown Title',
              description: descriptionText.trim(),
              debug: {
                titleFound: !!titleElement,
                descriptionFound: !!descriptionElement,
                descriptionLength: descriptionText.length,
                titleSelector: titleElement ? 'found' : 'not found',
                descriptionSelector: descriptionElement ? 'found' : 'not found'
              }
            };
            
            console.log('Video data extraction result:', result);
            return result;
          })()
        `
      });
      
      return results[0];
    } catch (error) {
      console.error('Error getting video data:', error);
      return null;
    }
  }

  showCurrentVideo(videoData, videoId) {
    const currentVideoDiv = document.getElementById('current-video');
    const titleElement = document.getElementById('current-title');
    const progressElement = document.getElementById('current-progress');
    const progressText = document.getElementById('progress-text');
    const watchTime = document.getElementById('watch-time');
    const progressFill = document.getElementById('progress-fill');
    
    titleElement.textContent = videoData.title;
    currentVideoDiv.style.display = 'block';
    
    // Check if this video is tracked and show progress
    this.isVideoTracked(videoId).then(isTracked => {
      if (isTracked && this.courses[videoId]) {
        const course = this.courses[videoId];
        const completedChapters = Object.values(course.progress || {}).filter(p => p.completed).length;
        const totalChapters = course.chapters ? course.chapters.length : 0;
        const progressPercentage = this.getProgressPercentage(course);
        
        progressElement.style.display = 'block';
        progressText.textContent = `${completedChapters}/${totalChapters} chapters`;
        watchTime.textContent = `${this.formatTime(course.totalWatchTime || 0)} watched`;
        progressFill.style.width = `${progressPercentage}%`;
        
        // Add chapter preview
        this.showChapterPreview(course, progressElement);
      } else {
        progressElement.style.display = 'none';
      }
    });
  }

  async isVideoTracked(videoId) {
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    return !!courses[videoId];
  }

  async toggleTracking(videoId, videoData, shouldTrack) {
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    
    if (shouldTrack) {
      const chapters = this.parseChapters(videoData.description);
      
      courses[videoId] = {
        title: videoData.title,
        description: videoData.description,
        chapters: chapters,
        manualChapters: null, // Will store manually imported chapters
        totalWatchTime: 0,
        sessions: 0,
        progress: {},
        dateAdded: new Date().toISOString(),
        lastWatched: null
      };
      
      // Initialize progress for each chapter
      chapters.forEach((chapter, index) => {
        courses[videoId].progress[index] = {
          completed: false,
          watchTime: 0
        };
      });
      
      // If no chapters found, automatically open import dialog
      if (chapters.length === 0) {
        setTimeout(() => {
          this.showManualChapterImport(videoId);
        }, 100);
      }
    } else {
      delete courses[videoId];
    }
    
    await browser.storage.local.set({ courses: courses });
    await this.loadCurrentVideo(); // Refresh current video display
    await this.loadCourses(); // Refresh courses list
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

  async loadCourses() {
    const result = await browser.storage.local.get(['courses']);
    this.courses = result.courses || {};
  }

  createCourseElement(videoId, course) {
    const courseDiv = document.createElement('div');
    courseDiv.className = 'course-item';
    
    const completedChapters = Object.values(course.progress).filter(p => p.completed).length;
    const totalChapters = course.chapters.length;
    const progressPercentage = totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;
    
    courseDiv.innerHTML = `
      <div class="course-title">${course.title}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercentage}%"></div>
      </div>
      <div class="course-stats">
        <span>${completedChapters}/${totalChapters} chapters</span>
        <span>${course.sessions} sessions</span>
      </div>
    `;
    
    courseDiv.onclick = () => this.openVideo(videoId);
    
    return courseDiv;
  }

  applyFiltersAndSort() {
    let filtered = { ...this.courses };
    
    // Apply search filter
    if (this.searchQuery) {
      filtered = Object.fromEntries(
        Object.entries(filtered).filter(([videoId, course]) =>
          course.title.toLowerCase().includes(this.searchQuery.toLowerCase())
        )
      );
    }
    
    // Sort courses
    const entries = Object.entries(filtered);
    entries.sort((a, b) => {
      const [videoIdA, courseA] = a;
      const [videoIdB, courseB] = b;
      
      switch (this.sortBy) {
        case 'recent':
          return new Date(courseB.lastWatched || courseB.dateAdded) - new Date(courseA.lastWatched || courseA.dateAdded);
        case 'progress':
          const progressA = this.getProgressPercentage(courseA);
          const progressB = this.getProgressPercentage(courseB);
          return progressB - progressA;
        case 'title':
          return courseA.title.localeCompare(courseB.title);
        case 'added':
          return new Date(courseB.dateAdded) - new Date(courseA.dateAdded);
        default:
          return 0;
      }
    });
    
    this.filteredCourses = Object.fromEntries(entries);
  }

  getProgressPercentage(course) {
    const completedChapters = Object.values(course.progress || {}).filter(p => p.completed).length;
    const totalChapters = course.chapters ? course.chapters.length : 0;
    return totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;
  }

  renderCourses() {
    const coursesList = document.getElementById('courses-list');
    const courseCount = document.getElementById('course-count');
    
    if (!coursesList) return;

    const courseEntries = Object.entries(this.filteredCourses);
    
    // Update course count
    if (courseCount) {
      courseCount.textContent = Object.keys(this.courses).length;
    }
    
    if (courseEntries.length === 0) {
      if (this.searchQuery) {
        coursesList.innerHTML = '<div class="no-courses">No courses found matching your search.</div>';
      } else {
        coursesList.innerHTML = '<div class="no-courses">No courses tracked yet. Visit a YouTube video and use the floating button or progress tracker to get started!</div>';
      }
      return;
    }

    coursesList.innerHTML = courseEntries.map(([videoId, course]) => {
      const completedChapters = Object.values(course.progress || {}).filter(p => p.completed).length;
      const totalChapters = course.chapters ? course.chapters.length : 0;
      const progressPercentage = this.getProgressPercentage(course);
      const isCurrentVideo = videoId === this.currentVideoId;
      
      return `
        <div class="course-item ${isCurrentVideo ? 'current' : ''}" data-video-id="${videoId}">
          <div class="course-thumbnail">
            <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="Course thumbnail" onerror="this.style.display='none'">
          </div>
          <div class="course-content">
            <div class="course-actions">
              <button class="course-action-btn remove" data-action="remove" title="Remove course">
                <img src="icons/remove.svg" width="12" height="12">
              </button>
            </div>
            <div class="course-title">${course.title}</div>
            <div class="course-stats">
              ${completedChapters}/${totalChapters} chapters • ${this.formatTime(course.totalWatchTime || 0)} watched
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            <div class="simple-chapter-list">
              ${course.chapters && course.chapters.length > 0 ? `${completedChapters} of ${totalChapters} chapters completed` : 'No chapters detected'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners for course items and action buttons
    coursesList.querySelectorAll('.course-item').forEach(item => {
      const videoId = item.dataset.videoId;
      
      // Course item click (open video)
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.course-action-btn')) {
          this.openVideo(videoId);
        }
      });
      
      // Action button clicks
      item.querySelectorAll('.course-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'remove') {
            this.removeCourse(videoId);
          }
        });
      });
      
    });
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  async refreshCourses() {
    await this.loadCourses();
    await this.loadCurrentVideo();
    this.applyFiltersAndSort();
    this.renderCourses();
  }

  handleSearch(query) {
    this.searchQuery = query;
    const clearSearch = document.getElementById('clear-search');
    
    if (clearSearch) {
      clearSearch.style.display = query ? 'flex' : 'none';
    }
    
    this.applyFiltersAndSort();
    this.renderVideos();
  }

  clearSearch() {
    const searchInput = document.getElementById('search-input');
    const clearSearch = document.getElementById('clear-search');
    
    if (searchInput) searchInput.value = '';
    if (clearSearch) clearSearch.style.display = 'none';
    
    this.searchQuery = '';
    this.applyFiltersAndSort();
    this.renderCourses();
  }

  handleSort(sortBy) {
    this.sortBy = sortBy;
    this.applyFiltersAndSort();
    this.renderCourses();
  }

  async removeCourse(videoId) {
    const course = this.courses[videoId];
    const courseTitle = course?.title || 'this course';
    
    // Check if user has disabled confirmation
    const result = await browser.storage.local.get(['skipRemoveConfirmation']);
    const skipConfirmation = result.skipRemoveConfirmation || false;
    
    if (skipConfirmation) {
      // Skip confirmation and remove directly
      delete this.courses[videoId];
      await browser.storage.local.set({ courses: this.courses });
      
      // Update current video display if it was the removed course
      if (videoId === this.currentVideoId) {
        await this.loadCurrentVideo();
      }
      
      this.applyFiltersAndSort();
      this.renderCourses();
      return;
    }
    
    // Show custom confirmation dialog
    const confirmed = await this.showRemoveConfirmation(courseTitle);
    if (confirmed) {
      delete this.courses[videoId];
      await browser.storage.local.set({ courses: this.courses });
      
      // Update current video display if it was the removed course
      if (videoId === this.currentVideoId) {
        await this.loadCurrentVideo();
      }
      
      this.applyFiltersAndSort();
      this.renderCourses();
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
        <h3 style="margin: 0 0 15px 0; color: ${isDarkMode ? '#e0e0e0' : '#333'};">Remove Course</h3>
        <p style="color: ${isDarkMode ? '#ccc' : '#666'}; font-size: 14px; margin-bottom: 20px;">
          Are you sure you want to remove "<strong style="color: ${isDarkMode ? '#fff' : '#333'};">${courseTitle}</strong>" from tracking? 
          This will also delete any manually imported chapters and all progress data.
        </p>
        <div style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${isDarkMode ? '#ccc' : '#666'}; cursor: pointer;">
            <input type="checkbox" id="dont-show-again" style="margin: 0; accent-color: #ff0000;">
            Don't show this confirmation again
          </label>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-remove" style="
            padding: 8px 16px;
            border: 1px solid ${isDarkMode ? '#555' : '#ddd'};
            background: ${isDarkMode ? '#333' : 'white'};
            color: ${isDarkMode ? '#e0e0e0' : '#333'};
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='${isDarkMode ? '#444' : '#f5f5f5'}'" onmouseout="this.style.background='${isDarkMode ? '#333' : 'white'}'">Cancel</button>
          <button id="confirm-remove" style="
            padding: 8px 16px;
            border: none;
            background: #ff0000;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.background='#cc0000'" onmouseout="this.style.background='#ff0000'">Remove Course</button>
        </div>
      `;
      
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      const cancelBtn = document.getElementById('cancel-remove');
      const confirmBtn = document.getElementById('confirm-remove');
      const dontShowAgain = document.getElementById('dont-show-again');
      
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

  async openVideo(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    await browser.tabs.create({ url });
    window.close();
  }

  showChapterPreview(course, progressElement) {
    // Remove existing chapter preview
    const existingPreview = progressElement.querySelector('.chapter-preview');
    if (existingPreview) {
      existingPreview.remove();
    }
    
    if (!course.chapters || course.chapters.length === 0) {
      return;
    }
    
    const chapterPreview = document.createElement('div');
    chapterPreview.className = 'chapter-preview';
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    chapterPreview.style.cssText = `
      margin-top: 8px;
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid ${isDarkMode ? '#444' : '#e0e0e0'};
      border-radius: 4px;
      background: ${isDarkMode ? '#2a2a2a' : '#fafafa'};
    `;
    
    // Show all chapters
    chapterPreview.innerHTML = `
      ${course.chapters.map((chapter, index) => {
        const progress = course.progress[index];
        const isCompleted = progress?.completed || false;
        
        return `
          <div style="
            padding: 4px 8px;
            border-bottom: 1px solid ${isDarkMode ? '#444' : '#eee'};
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 6px;
            ${isCompleted ? `background: ${isDarkMode ? '#1a4a1a' : '#f0f8f0'};` : ''}
          ">
            <span style="
              color: ${isCompleted ? '#4caf50' : (isDarkMode ? '#aaa' : '#666')};
              font-weight: ${isCompleted ? 'bold' : 'normal'};
            ">${isCompleted ? '✓' : '○'}</span>
            <span style="color: ${isDarkMode ? '#aaa' : '#999'}; min-width: 35px;">${chapter.timestamp}</span>
            <span style="
              flex: 1;
              color: ${isCompleted ? '#4caf50' : (isDarkMode ? '#e0e0e0' : '#333')};
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">${chapter.title}</span>
          </div>
        `;
      }).join('')}
    `;
    
    progressElement.appendChild(chapterPreview);
  }


  showManualChapterImport(videoId) {
    const course = this.courses[videoId];
    if (!course) return;
    
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
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 20px;
      width: 90%;
      max-width: 500px;
      max-height: 80%;
      overflow-y: auto;
    `;
    
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    modalContent.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: ${isDarkMode ? '#e0e0e0' : '#333'};">Import Chapters Manually</h3>
      <p style="color: ${isDarkMode ? '#ccc' : '#666'}; font-size: 14px; margin-bottom: 15px;">
        No chapters were found in the video description. Paste timestamps from comments or other sources:
      </p>
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
      "></textarea>
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
        " onmouseover="this.style.background='#cc0000'" onmouseout="this.style.background='#ff0000'" disabled>Import Chapters</button>
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
    
    // Real-time preview
    textarea.addEventListener('input', () => {
      const text = textarea.value.trim();
      if (text) {
        parsedChapters = this.parseChapters(text);
        this.showChapterPreviewInModal(parsedChapters, preview);
        importBtn.disabled = parsedChapters.length === 0;
      } else {
        preview.innerHTML = '';
        importBtn.disabled = true;
      }
    });
    
    // Import button
    importBtn.addEventListener('click', async () => {
      if (parsedChapters.length > 0) {
        await this.importManualChapters(videoId, parsedChapters);
        document.body.removeChild(modal);
        await this.refreshCourses();
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
  
  showChapterPreviewInModal(chapters, previewElement) {
    if (chapters.length === 0) {
      previewElement.innerHTML = '<p style="color: #999; font-style: italic;">No valid chapters detected</p>';
      return;
    }
    
    previewElement.innerHTML = `
      <h4 style="margin: 0 0 10px 0; color: #333;">Preview (${chapters.length} chapters found):</h4>
      <div style="border: 1px solid #e0e0e0; border-radius: 4px; background: #f9f9f9;">
        ${chapters.map((chapter, index) => `
          <div style="
            padding: 6px 10px;
            border-bottom: ${index < chapters.length - 1 ? '1px solid #eee' : 'none'};
            font-size: 13px;
            display: flex;
            gap: 10px;
          ">
            <span style="color: #666; min-width: 50px; font-family: monospace;">${chapter.timestamp}</span>
            <span style="flex: 1;">${chapter.title}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  async importManualChapters(videoId, chapters) {
    const result = await browser.storage.local.get(['courses']);
    const courses = result.courses || {};
    
    if (courses[videoId]) {
      courses[videoId].manualChapters = chapters;
      courses[videoId].chapters = chapters; // Use manual chapters as active chapters
      courses[videoId].progress = {};
      
      // Initialize progress for each manual chapter
      chapters.forEach((chapter, index) => {
        courses[videoId].progress[index] = {
          completed: false,
          watchTime: 0
        };
      });
      
      await browser.storage.local.set({ courses });
      this.courses = courses;
      console.log(`Imported ${chapters.length} manual chapters for video ${videoId}`);
    }
  }

  setupEventListeners() {
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.refreshCourses());
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    }

    const clearSearch = document.getElementById('clear-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => this.clearSearch());
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => this.handleSort(e.target.value));
    }
  }
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
  new CourseTracker();
});