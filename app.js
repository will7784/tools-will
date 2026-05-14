// Variables globales
let images = [];
let isAuthenticated = false;

// Elementos del DOM
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const imagesContainer = document.getElementById('images-container');
const addImageBtn = document.getElementById('add-image-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const exportModal = document.getElementById('export-modal');
const cancelExportBtn = document.getElementById('cancel-export-btn');
const confirmExportBtn = document.getElementById('confirm-export-btn');
const pdfTitleInput = document.getElementById('pdf-title');
const pdfFilenameInput = document.getElementById('pdf-filename');

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    checkAuthentication();
});

// Configurar event listeners
function setupEventListeners() {
    // Login
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    // Sidebar
    sidebarToggle.addEventListener('click', toggleSidebar);

    // Navegación entre herramientas
    document.querySelectorAll('.menu-item[data-tool]').forEach(item => {
        item.addEventListener('click', function() {
            const tool = this.dataset.tool;
            if (tool && tool !== 'placeholder') {
                switchTool(tool);
            }
        });
    });

    // Imágenes
    addImageBtn.addEventListener('click', addEmptyImage);
    document.addEventListener('paste', handlePaste); // Cambiado a document para capturar pegado global
    imagesContainer.addEventListener('click', handleImageClick);

    // Pegado de texto en textareas
    document.addEventListener('paste', handleTextPaste);

    // Exportar PDF
    exportPdfBtn.addEventListener('click', showExportModal);
    cancelExportBtn.addEventListener('click', hideExportModal);
    confirmExportBtn.addEventListener('click', exportToPDF);

    // Atajos de teclado
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Cartolas
    setupCartolaListeners();
}

// Verificar autenticación
function checkAuthentication() {
    const authStatus = localStorage.getItem('tools-will-auth');
    if (authStatus === 'authenticated') {
        showMainApp();
    } else {
        showLoginScreen();
    }
}

// Manejar login
function handleLogin() {
    const password = passwordInput.value.trim();

    if (password === APP_PASSWORD) {
        isAuthenticated = true;
        localStorage.setItem('tools-will-auth', 'authenticated');
        showMainApp();
    } else {
        showLoginError('Contraseña incorrecta');
    }
}

// Mostrar pantalla de login
function showLoginScreen() {
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    passwordInput.focus();
}

// Mostrar aplicación principal
function showMainApp() {
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    loadImages();
}

// Mostrar error de login
function showLoginError(message) {
    loginError.textContent = message;
    passwordInput.value = '';
    passwordInput.focus();
}

// Toggle sidebar
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
}

// Agregar imagen vacía
function addEmptyImage() {
    const imageItem = createImageItem(null, '');
    imagesContainer.appendChild(imageItem);
    const newImageId = parseInt(imageItem.dataset.id);
    images.push({ id: newImageId, data: null, comment: '', added: false });
    updateExportButton();
}

// Verificar si una imagen está lista para PDF (solo automática, no bloquea edición)
function checkImageReady(imageId) {
    const image = images.find(img => img.id == imageId);
    if (image && image.data && image.comment && image.comment.trim().length >= 10) { // Aumentado a 10 caracteres para evitar activaciones prematuras
        if (!image.added) {
            image.added = true;
            const imageItem = document.querySelector(`[data-id="${imageId}"]`);
            if (imageItem) {
                imageItem.classList.add('added-to-pdf');
                const addBtn = imageItem.querySelector('.add-comment-btn');
                addBtn.disabled = true;
                addBtn.textContent = 'Agregado';
                imageItem.querySelector('.delete-image-btn').disabled = true;
                imageItem.querySelector('.paste-text-btn').disabled = true;
                imageItem.querySelector('textarea').disabled = true;

                // Agregar botón de eliminar con X roja
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-added-btn';
                removeBtn.innerHTML = '✕';
                removeBtn.title = 'Remover del PDF';
                removeBtn.onclick = function() {
                    image.added = false;
                    imageItem.classList.remove('added-to-pdf');
                    addBtn.disabled = false;
                    addBtn.textContent = 'Agregar';
                    imageItem.querySelector('.delete-image-btn').disabled = false;
                    imageItem.querySelector('.paste-text-btn').disabled = false;
                    imageItem.querySelector('textarea').disabled = false;
                    removeBtn.remove();
                    updatePdfPositions();
                    updateExportButton();
                };
                imageItem.querySelector('.image-actions').appendChild(removeBtn);

                updatePdfPositions();
                updateExportButton();
            }
        }
    }
}

// Manejar pegado de imágenes
function handlePaste(e) {
    // Solo procesar si estamos en la aplicación principal (no en login)
    if (mainApp.classList.contains('hidden')) {
        return;
    }

    // Si la herramienta activa es cartolas, procesar imagen directamente
    const activeTool = document.querySelector('.menu-item.active');
    if (activeTool && activeTool.dataset.tool === 'import-cartola') {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function(event) {
                    cartolaImageData = event.target.result;
                    showCartolaImage(cartolaImageData);
                };
                reader.readAsDataURL(blob);
                break;
            }
        }
        return;
    }

    e.preventDefault();

    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();

            reader.onload = function(event) {
                const imageData = event.target.result;
                const imageItem = createImageItem(imageData, '');
                imagesContainer.appendChild(imageItem);
                const newImageId = parseInt(imageItem.dataset.id);
                images.push({ id: newImageId, data: imageData, comment: '', added: false });
                // Marcar el contenedor como que tiene imagen
                imageItem.querySelector('.image-container').classList.add('has-image');
                // Verificar automáticamente si la imagen está lista (sin comentario aún)
                updateExportButton();
            };

            reader.readAsDataURL(blob);
            break; // Solo procesar la primera imagen
        }
    }
}

// Crear elemento de imagen
function createImageItem(imageData, comment) {
    const imageItem = document.createElement('div');
    imageItem.className = 'image-item';
    // Usar timestamp simple para consistencia
    const uniqueId = Date.now();
    imageItem.dataset.id = uniqueId;

    imageItem.innerHTML = `
        <div class="image-container ${imageData ? 'has-image' : ''}">
            <img class="image-preview" src="${imageData || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkhhY2UgY2xpYyBwYXJhIHBlZ2FyIG8gYXJyYXN0cmFyIGltYWdlbjwvdGV4dD48L3N2Zz4='}" alt="Imagen">
            <div class="paste-hint">Ctrl+V para pegar imagen</div>
        </div>
        <div class="image-details">
            <div class="comment-header">
                <label>Descripción/Comentario:</label>
                <button class="paste-text-btn" title="Pegar texto del portapapeles (Ctrl+V)">📄 Pegar Texto</button>
            </div>
            <textarea placeholder="Agrega un comentario o descripción para esta imagen... (puedes pegar texto con Ctrl+V)" rows="3">${comment}</textarea>
            <div class="image-actions">
                <button class="add-comment-btn">Agregar</button>
                <button class="delete-image-btn">Eliminar</button>
                <span class="pdf-position" style="display: none;"></span>
            </div>
        </div>
    `;

    // Event listeners para el nuevo elemento
    const textarea = imageItem.querySelector('textarea');
    const deleteBtn = imageItem.querySelector('.delete-image-btn');
    const pasteTextBtn = imageItem.querySelector('.paste-text-btn');
    const addCommentBtn = imageItem.querySelector('.add-comment-btn');

    textarea.addEventListener('input', function() {
        updateImageComment(imageItem.dataset.id, this.value);
        // Verificar automáticamente si la imagen está lista
        checkImageReady(imageItem.dataset.id);
    });

    pasteTextBtn.addEventListener('click', function() {
        pasteTextToTextarea(textarea);
    });

    addCommentBtn.addEventListener('click', function() {
        const imageItem = addCommentBtn.closest('.image-item');
        const imageId = imageItem.dataset.id;
        const image = images.find(img => img.id == imageId);

        if (!image) {
            console.error('ERROR: Image object not found in images array!');
            console.log('Looking for ID:', imageId);
            console.log('Available images:', images.map(img => ({ id: img.id, hasData: !!img.data })));
            alert('Error interno: No se pudo encontrar la imagen. Intente recargar la página.');
            return;
        }

        if (image.data && image.comment && image.comment.trim().length >= 3) {
            if (!image.added) {
                // Forzar agregación manual
                image.added = true;
                imageItem.classList.add('added-to-pdf');

                addCommentBtn.disabled = true;
                addCommentBtn.textContent = 'Agregado';
                imageItem.querySelector('.delete-image-btn').disabled = true;
                imageItem.querySelector('.paste-text-btn').disabled = true;
                imageItem.querySelector('textarea').disabled = true;

                // Agregar botón de eliminar con X roja
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-added-btn';
                removeBtn.innerHTML = '✕';
                removeBtn.title = 'Remover del PDF';
                removeBtn.onclick = function() {
                    image.added = false;
                    imageItem.classList.remove('added-to-pdf');
                    addCommentBtn.disabled = false;
                    addCommentBtn.textContent = 'Agregar';
                    imageItem.querySelector('.delete-image-btn').disabled = false;
                    imageItem.querySelector('.paste-text-btn').disabled = false;
                    imageItem.querySelector('textarea').disabled = false;
                    removeBtn.remove();
                    updatePdfPositions();
                    updateExportButton();
                };
                imageItem.querySelector('.image-actions').appendChild(removeBtn);

                updatePdfPositions();
                updateExportButton();
            }
        } else {
            const missing = [];
            if (!image.data) missing.push('imagen');
            if (!image.comment || image.comment.trim().length < 3) missing.push('descripción de al menos 3 caracteres');
            alert(`Faltan: ${missing.join(' y ')}`);
        }
    });

    deleteBtn.addEventListener('click', function() {
        deleteImage(imageItem.dataset.id);
        imageItem.remove();
    });

    return imageItem;
}

// Manejar clic en imágenes
function handleImageClick(e) {
    if (e.target.classList.contains('image-preview')) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageData = event.target.result;
                    e.target.src = imageData;
                    const imageId = e.target.closest('.image-item').dataset.id;
                    updateImageData(imageId, imageData);
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }
}

// Actualizar comentario de imagen
function updateImageComment(imageId, comment) {
    const image = images.find(img => img.id == imageId);
    if (image) {
        image.comment = comment;
    }
}

// Actualizar datos de imagen
function updateImageData(imageId, data) {
    const image = images.find(img => img.id == imageId);
    if (image) {
        image.data = data;
        // Actualizar la clase has-image en el contenedor
        const imageItem = document.querySelector(`[data-id="${imageId}"]`);
        if (imageItem) {
            const container = imageItem.querySelector('.image-container');
            container.classList.add('has-image');
        }
        // Verificar automáticamente si la imagen está lista
        checkImageReady(imageId);
    }
    updateExportButton();
}

// Eliminar imagen
function deleteImage(imageId) {
    images = images.filter(img => img.id != imageId);
    updateExportButton();
}

// Actualizar estado del botón de exportar
function updateExportButton() {
    const hasAddedImages = images.some(img => img.added);
    exportPdfBtn.disabled = !hasAddedImages;
    exportPdfBtn.style.opacity = hasAddedImages ? '1' : '0.5';
}

// Cargar imágenes guardadas
function loadImages() {
    const savedImages = localStorage.getItem('tools-will-images');
    if (savedImages) {
        images = JSON.parse(savedImages);
        images.forEach(img => {
            // Asegurar que todas las imágenes tengan la propiedad 'added'
            if (img.added === undefined) {
                img.added = false;
            }
            const imageItem = createImageItem(img.data, img.comment);
            // Usar el ID original de la imagen guardada
            imageItem.dataset.id = img.id;
            if (img.added) {
                imageItem.classList.add('added-to-pdf');
                const addBtn = imageItem.querySelector('.add-comment-btn');
                const deleteBtn = imageItem.querySelector('.delete-image-btn');
                const pasteBtn = imageItem.querySelector('.paste-text-btn');
                const textarea = imageItem.querySelector('textarea');
                addBtn.disabled = true;
                addBtn.textContent = 'Agregado';
                deleteBtn.disabled = true;
                pasteBtn.disabled = true;
                textarea.disabled = true;

                // Agregar botón de eliminar con X roja para imágenes cargadas
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-added-btn';
                removeBtn.innerHTML = '✕';
                removeBtn.title = 'Remover del PDF';
                removeBtn.onclick = function() {
                    img.added = false;
                    imageItem.classList.remove('added-to-pdf');
                    addBtn.disabled = false;
                    addBtn.textContent = 'Agregar';
                    deleteBtn.disabled = false;
                    pasteBtn.disabled = false;
                    textarea.disabled = false;
                    removeBtn.remove();
                    updatePdfPositions();
                    updateExportButton();
                };
                imageItem.querySelector('.image-actions').appendChild(removeBtn);
            }
            imagesContainer.appendChild(imageItem);
        });
        updatePdfPositions();
    }
    updateExportButton();
}

// Guardar imágenes
function saveImages() {
    localStorage.setItem('tools-will-images', JSON.stringify(images));
}

// Mostrar modal de exportación
function showExportModal() {
    if (images.length === 0 || !images.some(img => img.added)) {
        alert('Agrega al menos una imagen al PDF antes de exportar.');
        return;
    }

    // Limpiar campos
    pdfTitleInput.value = 'Mi Guía de Imágenes';
    pdfFilenameInput.value = 'mi-guia.pdf';

    exportModal.classList.remove('hidden');
    pdfTitleInput.focus();
}

// Ocultar modal de exportación
function hideExportModal() {
    exportModal.classList.add('hidden');
}

// Esta función ya no se usa, pero la mantenemos por compatibilidad
function selectDownloadPath() {
    // Función eliminada - el PDF se descarga directamente
}

// Exportar a PDF
async function exportToPDF() {
    const title = pdfTitleInput.value.trim();
    const filename = pdfFilenameInput.value.trim();

    if (!title) {
        alert('Ingresa un título para el documento.');
        return;
    }

    if (!filename) {
        alert('Ingresa un nombre para el archivo.');
        return;
    }

    if (!filename.endsWith('.pdf')) {
        pdfFilenameInput.value = filename + '.pdf';
    }

    // Mostrar indicador de carga
    confirmExportBtn.disabled = true;
    confirmExportBtn.textContent = 'Generando PDF...';

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();

        let yPosition = 20;
        let pageCount = 1;

        // Agregar título personalizado al PDF
        pdf.setFontSize(18);
        pdf.setFont(undefined, 'bold');
        const titleLines = pdf.splitTextToSize(title, 180);
        pdf.text(titleLines, 15, yPosition);
        yPosition += titleLines.length * 8 + 10;

        // Agregar fecha
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(10);
        pdf.text(`Generado el: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, 15, yPosition);
        yPosition += 15;

        const addedImages = images.filter(img => img.added);
        for (let i = 0; i < addedImages.length; i++) {
            const img = addedImages[i];

            if (img.data) {
                // Verificar si necesitamos una nueva página
                if (yPosition > 200) {
                    pdf.addPage();
                    yPosition = 20;
                    pageCount++;
                }

                // Agregar descripción arriba
                if (img.comment && img.comment.trim()) {
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    const descLines = pdf.splitTextToSize(img.comment.trim(), 180);
                    pdf.text(descLines, 15, yPosition);
                    yPosition += descLines.length * 6 + 5;
                }

                // Agregar imagen
                const imgElement = new Image();
                imgElement.src = img.data;

                await new Promise((resolve) => {
                    imgElement.onload = () => {
                        const maxWidth = 180;
                        const maxHeight = 120;
                        let imgWidth = maxWidth;
                        let imgHeight = (imgElement.height * imgWidth) / imgElement.width;

                        // Ajustar si la altura es demasiado grande
                        if (imgHeight > maxHeight) {
                            imgHeight = maxHeight;
                            imgWidth = (imgElement.width * imgHeight) / imgElement.height;
                        }

                        // Verificar espacio disponible
                        if (yPosition + imgHeight > 270) {
                            pdf.addPage();
                            yPosition = 20;
                            pageCount++;
                        }

                        pdf.addImage(imgElement, 'JPEG', 15, yPosition, imgWidth, imgHeight);
                        yPosition += imgHeight + 5;

                        // Espacio adicional debajo de la imagen
                        yPosition += 5;

                        // Línea separadora
                        pdf.setLineWidth(0.5);
                        pdf.line(15, yPosition, 195, yPosition);
                        yPosition += 10;

                        resolve();
                    };
                });
            }
        }

        // Agregar pie de página con estadísticas
        const totalPages = pdf.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.text(`Página ${i} de ${totalPages} - ${title}`, 15, 285);
        }

        // Descargar el PDF
        pdf.save(filename);

        alert(`PDF "${filename}" generado exitosamente con ${addedImages.length} imágenes!\n\nElige el directorio para guardar tu PDF desde el diálogo de descarga del navegador.`);

        hideExportModal();

        // Limpiar imágenes agregadas después de exportar
        images.forEach(img => {
            if (img.added) {
                const imageItem = document.querySelector(`[data-id="${img.id}"]`);
                if (imageItem) {
                    imageItem.remove();
                }
            }
        });
        images = images.filter(img => !img.added);

        saveImages();
        updateExportButton();

    } catch (error) {
        console.error('Error al generar PDF:', error);
        alert('Error al generar el PDF. Revisa la consola para más detalles.');
    } finally {
        // Restaurar botón
        confirmExportBtn.disabled = false;
        confirmExportBtn.textContent = 'Exportar';
    }
}

// Manejar atajos de teclado
function handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'v':
                // El pegado se maneja en el event listener de paste
                break;
            case 's':
                e.preventDefault();
                saveImages();
                break;
        }
    }
}

// Pegar texto a un textarea específico
function pasteTextToTextarea(textarea) {
    navigator.clipboard.readText().then(text => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentValue = textarea.value;

        // Insertar el texto en la posición del cursor
        textarea.value = currentValue.substring(0, start) + text + currentValue.substring(end);

        // Actualizar la posición del cursor
        textarea.selectionStart = textarea.selectionEnd = start + text.length;

        // Trigger del evento input para actualizar el comentario
        textarea.dispatchEvent(new Event('input'));

        // Enfocar el textarea
        textarea.focus();
    }).catch(err => {
        alert('No se pudo acceder al portapapeles. Asegúrate de tener permisos para leer el portapapeles.');
        console.error('Error al leer del portapapeles:', err);
    });
}

// Manejar pegado de texto en textareas
function handleTextPaste(e) {
    // Solo procesar si estamos en la aplicación principal
    if (mainApp.classList.contains('hidden')) {
        return;
    }

    // Verificar si el foco está en un textarea de comentario
    const activeElement = document.activeElement;
    if (activeElement && activeElement.tagName === 'TEXTAREA' && activeElement.closest('.image-item')) {
        // El pegado normal de texto ya funciona en textareas, no necesitamos hacer nada especial
        return;
    }
}

// Actualizar posiciones en el PDF
function updatePdfPositions() {
    const addedImages = images.filter(img => img.added);
    addedImages.forEach((img, index) => {
        const imageItem = document.querySelector(`[data-id="${img.id}"]`);
        if (imageItem) {
            const positionSpan = imageItem.querySelector('.pdf-position');
            positionSpan.textContent = `Posición PDF: ${index + 1}`;
            positionSpan.style.display = 'inline';
        }
    });
}

// Función de utilidad para generar IDs únicos
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ============================================================
// NAVEGACIÓN ENTRE HERRAMIENTAS
// ============================================================

function switchTool(toolId) {
    // Actualizar menú activo
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tool === toolId) {
            item.classList.add('active');
        }
    });

    // Ocultar todas las herramientas
    document.querySelectorAll('.tool-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Mostrar la herramienta seleccionada
    const targetSection = document.getElementById('tool-' + toolId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
}

// ============================================================
// HERRAMIENTA: IMPORTAR CARTOLAS A KAME ERP
// ============================================================

let cartolaImageData = null;

function setupCartolaListeners() {
    const pasteArea = document.getElementById('cartola-paste-area');
    const clearBtn = document.getElementById('clear-cartola-btn');
    const processBtn = document.getElementById('process-cartola-btn');
    const copyResultBtn = document.getElementById('copy-result-btn');

    // Pegar imagen
    pasteArea.addEventListener('paste', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function(event) {
                    cartolaImageData = event.target.result;
                    showCartolaImage(cartolaImageData);
                };
                reader.readAsDataURL(blob);
                break;
            }
        }
    });

    // Drag & drop
    pasteArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        pasteArea.classList.add('dragover');
    });
    pasteArea.addEventListener('dragleave', function() {
        pasteArea.classList.remove('dragover');
    });
    pasteArea.addEventListener('drop', function(e) {
        e.preventDefault();
        pasteArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.indexOf('image') !== -1) {
            const reader = new FileReader();
            reader.onload = function(event) {
                cartolaImageData = event.target.result;
                showCartolaImage(cartolaImageData);
            };
            reader.readAsDataURL(files[0]);
        }
    });

    // Clic para seleccionar archivo
    pasteArea.addEventListener('click', function(e) {
        if (e.target.id === 'cartola-preview' || cartolaImageData) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    cartolaImageData = event.target.result;
                    showCartolaImage(cartolaImageData);
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });

    clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        clearCartolaImage();
    });

    processBtn.addEventListener('click', processCartolaWithDeepSeek);

    copyResultBtn.addEventListener('click', function() {
        const textarea = document.getElementById('cartola-result');
        textarea.select();
        document.execCommand('copy');
        const originalText = copyResultBtn.textContent;
        copyResultBtn.textContent = '✅ Copiado!';
        setTimeout(() => {
            copyResultBtn.textContent = originalText;
        }, 2000);
    });
}

function showCartolaImage(dataUrl) {
    const preview = document.getElementById('cartola-preview');
    const placeholder = document.getElementById('cartola-paste-placeholder');
    const clearBtn = document.getElementById('clear-cartola-btn');
    const processBtn = document.getElementById('process-cartola-btn');

    preview.src = dataUrl;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    clearBtn.classList.remove('hidden');
    processBtn.disabled = false;
}

function clearCartolaImage() {
    const preview = document.getElementById('cartola-preview');
    const placeholder = document.getElementById('cartola-paste-placeholder');
    const clearBtn = document.getElementById('clear-cartola-btn');
    const processBtn = document.getElementById('process-cartola-btn');
    const resultSection = document.getElementById('result-section');
    const status = document.getElementById('process-status');

    cartolaImageData = null;
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    processBtn.disabled = true;
    resultSection.classList.add('hidden');
    status.textContent = '';
}

async function processCartolaWithDeepSeek() {
    const status = document.getElementById('process-status');
    const processBtn = document.getElementById('process-cartola-btn');
    const resultSection = document.getElementById('result-section');
    const resultTextarea = document.getElementById('cartola-result');

    if (!cartolaImageData) {
        alert('Por favor pega una imagen de cartola primero.');
        return;
    }

    processBtn.disabled = true;
    processBtn.innerHTML = '<span>⏳</span> Analizando...';
    status.textContent = 'Extrayendo texto de la imagen con OCR...';
    status.className = 'process-status info';
    resultSection.classList.add('hidden');

    let ocrText = '';
    try {
        const result = await Tesseract.recognize(
            cartolaImageData,
            'spa',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        status.textContent = `Extrayendo texto con OCR... ${Math.round(m.progress * 100)}%`;
                    }
                }
            }
        );
        ocrText = result.data.text;
        if (!ocrText || ocrText.trim().length < 20) {
            throw new Error('No se pudo extraer texto legible de la imagen. Intenta con una imagen más nítida.');
        }
    } catch (ocrError) {
        console.error('Error OCR:', ocrError);
        status.textContent = `❌ Error OCR: ${ocrError.message}`;
        status.className = 'process-status error';
        processBtn.disabled = false;
        processBtn.innerHTML = '<span>🔍</span> Analizar cartola con DeepSeek';
        return;
    }

    status.textContent = 'Enviando texto extraído a DeepSeek...';

    try {
        const response = await fetch('/api/analyze-cartola-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: ocrText
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Error HTTP ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Extraer JSON de la respuesta (a veces viene con markdown)
        let jsonStr = content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            console.error('JSON parse error:', e, 'Content:', content);
            throw new Error('La respuesta de DeepSeek no es un JSON válido. Intenta de nuevo o revisa la imagen.');
        }

        if (!parsed.movimientos || !Array.isArray(parsed.movimientos)) {
            throw new Error('No se encontraron movimientos en la respuesta. Intenta con una imagen más clara.');
        }

        // Formatear resultado para Kame ERP
        const lines = parsed.movimientos.map(mov => {
            const fecha = mov.fecha || '';
            const comentario = (mov.comentario || '').replace(/;/g, ',');
            const tipo = mov.tipo || 'CARGO';
            const numero = mov.numero_mov || '2';
            const monto = typeof mov.monto === 'number' ? mov.monto.toFixed(2).replace(/\./g, ',') : (mov.monto || '0');
            return `${fecha};${comentario};${tipo};${numero};${monto}`;
        });

        // Encabezado
        const header = 'Fecha;Comentario;Tipo Mov.;Nº Mov.;Monto';
        const output = [header, ...lines].join('\n');

        resultTextarea.value = output;
        resultSection.classList.remove('hidden');
        status.textContent = `✅ ${parsed.movimientos.length} movimientos extraídos correctamente.`;
        status.className = 'process-status success';

    } catch (error) {
        console.error('Error procesando cartola:', error);
        status.textContent = `❌ Error: ${error.message}`;
        status.className = 'process-status error';
    } finally {
        processBtn.disabled = false;
        processBtn.innerHTML = '<span>🔍</span> Analizar cartola con DeepSeek';
    }
}