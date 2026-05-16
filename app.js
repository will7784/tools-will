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
let cartolaProcessedData = null;
let cartolaMimeType = 'image/png';
let useProcessedImage = true; // Por defecto usar imagen preprocesada

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
        if (files.length > 0) {
            const file = files[0];
            const isImage = file.type.indexOf('image') !== -1;
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            if (isImage || isPdf) {
                cartolaMimeType = isPdf ? 'application/pdf' : (file.type || 'image/png');
                const reader = new FileReader();
                reader.onload = function(event) {
                    cartolaImageData = event.target.result;
                    showCartolaImage(cartolaImageData, isPdf);
                };
                reader.readAsDataURL(file);
            }
        }
    });

    // Clic para seleccionar archivo
    pasteArea.addEventListener('click', function(e) {
        if (e.target.id === 'cartola-preview' || cartolaImageData) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        input.onchange = function() {
            const file = this.files[0];
            if (file) {
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                cartolaMimeType = isPdf ? 'application/pdf' : (file.type || 'image/png');
                const reader = new FileReader();
                reader.onload = function(event) {
                    cartolaImageData = event.target.result;
                    showCartolaImage(cartolaImageData, isPdf);
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

    // Validación de saldos
    const validateBtn = document.getElementById('validate-balance-btn');
    const clearValidationBtn = document.getElementById('clear-validation-btn');
    const saldoInicialInput = document.getElementById('saldo-inicial');
    const saldoFinalInput = document.getElementById('saldo-final');

    if (validateBtn) validateBtn.addEventListener('click', calculateAndValidateBalance);
    if (clearValidationBtn) clearValidationBtn.addEventListener('click', clearBalanceValidation);
    if (saldoInicialInput) saldoInicialInput.addEventListener('input', saveBalanceValidation);
    if (saldoFinalInput) saldoFinalInput.addEventListener('input', saveBalanceValidation);

    // Opciones de preprocesamiento
    const useProcessedCheckbox = document.getElementById('use-processed-image');
    const viewProcessedBtn = document.getElementById('view-processed-btn');
    const closeProcessedModalBtn = document.getElementById('close-processed-modal');
    const processedImageModal = document.getElementById('processed-image-modal');

    if (useProcessedCheckbox) {
        useProcessedImage = useProcessedCheckbox.checked;
        useProcessedCheckbox.addEventListener('change', function() {
            useProcessedImage = this.checked;
        });
    }

    if (viewProcessedBtn) {
        viewProcessedBtn.addEventListener('click', function() {
            if (cartolaProcessedData) {
                document.getElementById('processed-image-preview').src = cartolaProcessedData;
                processedImageModal.classList.remove('hidden');
            }
        });
    }

    if (closeProcessedModalBtn) {
        closeProcessedModalBtn.addEventListener('click', function() {
            processedImageModal.classList.add('hidden');
        });
    }

    if (processedImageModal) {
        processedImageModal.addEventListener('click', function(e) {
            if (e.target === processedImageModal) {
                processedImageModal.classList.add('hidden');
            }
        });
    }
}

function showCartolaImage(dataUrl, isPdf = false) {
    const preview = document.getElementById('cartola-preview');
    const placeholder = document.getElementById('cartola-paste-placeholder');
    const clearBtn = document.getElementById('clear-cartola-btn');
    const processBtn = document.getElementById('process-cartola-btn');

    if (isPdf) {
        preview.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTc0YzNjIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5QREY8L3RleHQ+PC9zdmc+';
    } else {
        preview.src = dataUrl;
    }
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    clearBtn.classList.remove('hidden');
    processBtn.disabled = false;

    // Preprocesar imagen automáticamente si no es PDF (modo vision para LLM)
    if (!isPdf && dataUrl) {
        preprocessImageForVision(dataUrl).then(processed => {
            cartolaProcessedData = processed;
            const viewBtn = document.getElementById('view-processed-btn');
            if (viewBtn) viewBtn.classList.remove('hidden');
            console.log('Imagen preprocesada lista (modo vision)');
        }).catch(err => {
            console.warn('Error en preprocesamiento:', err);
            cartolaProcessedData = null;
            const viewBtn = document.getElementById('view-processed-btn');
            if (viewBtn) viewBtn.classList.add('hidden');
        });
    } else {
        const viewBtn = document.getElementById('view-processed-btn');
        if (viewBtn) viewBtn.classList.add('hidden');
    }
}

function clearCartolaImage() {
    const preview = document.getElementById('cartola-preview');
    const placeholder = document.getElementById('cartola-paste-placeholder');
    const clearBtn = document.getElementById('clear-cartola-btn');
    const processBtn = document.getElementById('process-cartola-btn');
    const resultSection = document.getElementById('result-section');
    const status = document.getElementById('process-status');
    const viewProcessedBtn = document.getElementById('view-processed-btn');

    cartolaImageData = null;
    cartolaProcessedData = null;
    cartolaMimeType = 'image/png';
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    processBtn.disabled = true;
    resultSection.classList.add('hidden');
    status.textContent = '';
    if (viewProcessedBtn) viewProcessedBtn.classList.add('hidden');
}

async function preprocessImageForVision(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Upscale 3x para mejorar lectura de tablas pequeñas
            const scale = 3;
            const w = img.width * scale;
            const h = img.height * scale;
            canvas.width = w;
            canvas.height = h;

            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            let imageData = ctx.getImageData(0, 0, w, h);
            let data = imageData.data;
            const len = data.length;

            // Paso 1: Grayscale
            const gray = new Float32Array(w * h);
            for (let i = 0, j = 0; i < len; i += 4, j++) {
                gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }

            // Paso 2: Unsharp mask (sharpening) para resaltar bordes
            const sharpened = new Float32Array(w * h);
            const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            sum += gray[(y + ky) * w + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    sharpened[y * w + x] = Math.max(0, Math.min(255, sum));
                }
            }
            for (let y = 0; y < h; y++) {
                sharpened[y * w] = gray[y * w];
                sharpened[y * w + (w - 1)] = gray[y * w + (w - 1)];
            }
            for (let x = 0; x < w; x++) {
                sharpened[x] = gray[x];
                sharpened[(h - 1) * w + x] = gray[(h - 1) * w + x];
            }

            // Paso 3: Contraste global fuerte (NO binarizar - preserva info para LLM de visión)
            const contrast = 2.0;
            for (let i = 0, j = 0; i < len; i += 4, j++) {
                let v = sharpened[j];
                v = ((v - 128) * contrast) + 128;
                v = Math.max(0, Math.min(255, v));
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
            }

            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

async function preprocessImageForOCR(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const scale = 3;
            const w = img.width * scale;
            const h = img.height * scale;
            canvas.width = w;
            canvas.height = h;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            let imageData = ctx.getImageData(0, 0, w, h);
            let data = imageData.data;
            const len = data.length;

            const gray = new Float32Array(w * h);
            for (let i = 0, j = 0; i < len; i += 4, j++) {
                gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }

            // Sharpening
            const sharpened = new Float32Array(w * h);
            const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            sum += gray[(y + ky) * w + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    sharpened[y * w + x] = Math.max(0, Math.min(255, sum));
                }
            }
            for (let y = 0; y < h; y++) {
                sharpened[y * w] = gray[y * w];
                sharpened[y * w + (w - 1)] = gray[y * w + (w - 1)];
            }
            for (let x = 0; x < w; x++) {
                sharpened[x] = gray[x];
                sharpened[(h - 1) * w + x] = gray[(h - 1) * w + x];
            }

            // Threshold adaptativo para OCR puro
            const blockSize = 40;
            const halfBlock = blockSize / 2;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    const val = sharpened[idx];
                    let x0 = Math.max(0, x - halfBlock);
                    let x1 = Math.min(w, x + halfBlock);
                    let y0 = Math.max(0, y - halfBlock);
                    let y1 = Math.min(h, y + halfBlock);
                    let sum = 0, count = 0;
                    for (let yy = y0; yy < y1; yy++) {
                        for (let xx = x0; xx < x1; xx++) {
                            sum += sharpened[yy * w + xx];
                            count++;
                        }
                    }
                    const localMean = sum / count;
                    const C = 8;
                    const threshold = localMean - C;
                    const v = val > threshold ? 255 : 0;
                    data[idx * 4] = v;
                    data[idx * 4 + 1] = v;
                    data[idx * 4 + 2] = v;
                }
            }

            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

async function analyzeTextWithDeepSeek(text, resultTextarea, resultSection, status) {
    status.textContent = 'Enviando texto a DeepSeek...';
    const response = await fetch('/api/analyze-cartola-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonFromContent(content);

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error('La respuesta del análisis de texto no es un JSON válido.');
    }

    if (!parsed.movimientos || !Array.isArray(parsed.movimientos)) {
        throw new Error('No se encontraron movimientos en el texto.');
    }

    await handleParsedMovimientos(parsed.movimientos, resultTextarea, resultSection, status, 'DeepSeek texto');
}

async function analyzeImageWithVision(imageBase64, mimeType, resultTextarea, resultSection, status) {
    status.textContent = 'Enviando imagen a IA de visión...';
    const response = await fetch('/api/analyze-cartola-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonFromContent(content);

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error('La respuesta no es un JSON válido.');
    }

    if (!parsed.movimientos || !Array.isArray(parsed.movimientos)) {
        throw new Error('No se encontraron movimientos.');
    }

    await handleParsedMovimientos(parsed.movimientos, resultTextarea, resultSection, status, 'IA de visión');
}

async function processCartolaWithDeepSeek() {
    const status = document.getElementById('process-status');
    const processBtn = document.getElementById('process-cartola-btn');
    const resultSection = document.getElementById('result-section');
    const resultTextarea = document.getElementById('cartola-result');

    if (!cartolaImageData) {
        alert('Por favor pega una imagen o PDF de cartola primero.');
        return;
    }

    processBtn.disabled = true;
    processBtn.innerHTML = '<span>⏳</span> Analizando...';
    status.textContent = 'Preparando...';
    status.className = 'process-status info';
    resultSection.classList.add('hidden');

    try {
        // ============================================================
        // CASO 1: PDF NATIVO (texto seleccionable)
        // ============================================================
        if (cartolaMimeType === 'application/pdf') {
            status.textContent = '🔍 Extrayendo texto del PDF...';
            const pdfBase64 = cartolaImageData.split(',')[1];

            const extractResponse = await fetch('/api/extract-pdf-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfBase64 })
            });

            if (!extractResponse.ok) {
                const errData = await extractResponse.json().catch(() => ({}));
                throw new Error(errData.error || 'Error extrayendo PDF');
            }

            const extractData = await extractResponse.json();

            if (extractData.hasText && extractData.text) {
                // PDF nativo con texto → DeepSeek directo
                status.textContent = '✅ PDF nativo detectado. Analizando texto...';
                await analyzeTextWithDeepSeek(extractData.text, resultTextarea, resultSection, status);
                processBtn.disabled = false;
                processBtn.innerHTML = '<span>🔍</span> Analizar cartola';
                return;
            }

            // PDF escaneado: usamos la imagen generada por el backend
            if (extractData.imageBase64) {
                status.textContent = '🔍 PDF escaneado. Analizando imagen...';
                await analyzeImageWithVision(extractData.imageBase64, 'image/png', resultTextarea, resultSection, status);
                processBtn.disabled = false;
                processBtn.innerHTML = '<span>🔍</span> Analizar cartola';
                return;
            }
        }

        // ============================================================
        // CASO 2: IMAGEN (PNG/JPG)
        // ============================================================
        // Método A: OCR local + DeepSeek
        try {
            status.textContent = '🔍 Paso 1/2: OCR local + DeepSeek...';
            await tryOCRFallback(resultTextarea, resultSection, status);
            const lines = resultTextarea.value.trim().split('\n').filter(l => l.trim());
            if (lines.length >= 3) {
                status.textContent = `✅ ${lines.length} movimientos extraídos vía OCR + DeepSeek.`;
                status.className = 'process-status success';
                processBtn.disabled = false;
                processBtn.innerHTML = '<span>🔍</span> Analizar cartola';
                return;
            }
            console.warn('OCR devolvió muy pocos movimientos, intentando visión...');
        } catch (ocrError) {
            console.warn('OCR + DeepSeek falló:', ocrError);
        }

        // Método B: Visión directa (fallback)
        status.textContent = '🔍 Paso 2/2: Visión directa con IA...';
        let imageToSend = cartolaImageData;
        let mimeToSend = cartolaMimeType;

        if (useProcessedImage && cartolaProcessedData) {
            imageToSend = cartolaProcessedData;
            mimeToSend = 'image/png';
        }

        const base64Image = imageToSend.split(',')[1];
        await analyzeImageWithVision(base64Image, mimeToSend, resultTextarea, resultSection, status);

    } catch (error) {
        console.error('Error general:', error);
        status.textContent = `❌ Error: ${error.message}`;
        status.className = 'process-status error';
    } finally {
        processBtn.disabled = false;
        processBtn.innerHTML = '<span>🔍</span> Analizar cartola';
    }
}

function extractJsonFromContent(content) {
    // 1. Buscar bloque markdown
    const mdMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (mdMatch) return mdMatch[1];

    // 2. Buscar JSON con balance de llaves
    let braceCount = 0;
    let start = -1;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') {
            if (braceCount === 0) start = i;
            braceCount++;
        } else if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0 && start !== -1) {
                return content.substring(start, i + 1);
            }
        }
    }
    return content;
}

async function handleParsedMovimientos(movimientos, resultTextarea, resultSection, status, source) {
    // Convertir formato crudo (monto_cargo / monto_abono) a formato Kame ERP
    const converted = [];
    for (const mov of movimientos) {
        const comentarioRaw = (mov.comentario || '').toUpperCase();
        const comentario = (mov.comentario || '').replace(/;/g, ',');
        const fecha = mov.fecha || '';
        const saldo = typeof mov.saldo_despues === 'number' ? mov.saldo_despues : (parseInt(mov.saldo_despues) || 0);

        const montoCargo = typeof mov.monto_cargo === 'number' ? mov.monto_cargo : (parseInt(mov.monto_cargo) || 0);
        const montoAbono = typeof mov.monto_abono === 'number' ? mov.monto_abono : (parseInt(mov.monto_abono) || 0);

        let tipo, numero, monto;

        if (montoCargo > 0 && montoAbono === 0) {
            // El monto está en la columna de Cargos
            monto = montoCargo;
            if (comentarioRaw.includes('CHEQUE') || comentarioRaw.includes('CHQ')) {
                tipo = 'CHEQUE';
                numero = mov.numero_mov || '0';
            } else {
                tipo = 'CARGO';
                numero = '2';
            }
        } else if (montoAbono > 0 && montoCargo === 0) {
            // El monto está en la columna de Abonos
            monto = montoAbono;
            if (comentarioRaw.includes('DEPOSITO') || comentarioRaw.includes('DEPÓSITO')) {
                tipo = 'DEPOSITO';
                numero = mov.numero_mov || '1';
            } else {
                tipo = 'ABONO';
                numero = '1';
            }
        } else if (montoCargo > 0 && montoAbono > 0) {
            // Error del LLM: ambos tienen valor. Usar el que coincida con diferencia de saldo o el mayor
            monto = Math.max(montoCargo, montoAbono);
            tipo = 'CARGO';
            numero = '2';
            console.warn(`[Advertencia] Fila con ambos montos: ${comentario}, usando mayor: ${monto}`);
        } else {
            // Sin monto, saltar
            continue;
        }

        converted.push({ fecha, comentario, tipo, numero_mov: numero, monto, saldo_despues: saldo });
    }

    // Validación cruzada por saldos
    const corrected = correctMovementsByBalance(converted);

    // Formatear resultado para Kame ERP
    const lines = corrected.map(mov => {
        const fecha = mov.fecha || '';
        const comentario = (mov.comentario || '').replace(/;/g, ',');
        const tipo = mov.tipo || 'CARGO';
        const numero = mov.numero_mov || '2';
        const montoEntero = typeof mov.monto === 'number' ? Math.round(mov.monto) : (parseInt(mov.monto) || 0);
        return `${fecha};${comentario};${tipo};${numero};${montoEntero}`;
    });

    const output = lines.join('\n');

    resultTextarea.value = output;
    resultSection.classList.remove('hidden');
    status.textContent = `✅ ${corrected.length} movimientos extraídos correctamente vía ${source}.`;
    status.className = 'process-status success';

    restoreBalanceValidation();
}

async function tryOCRFallback(resultTextarea, resultSection, status) {
    if (!window.Tesseract) {
        throw new Error('Librería Tesseract no disponible.');
    }

    status.textContent = '🔍 Ejecutando OCR local con Tesseract...';

    // Para OCR puro usamos binarización adaptativa
    let imageToOCR = cartolaImageData;
    if (useProcessedImage) {
        try {
            imageToOCR = await preprocessImageForOCR(cartolaImageData);
            status.textContent = '🔍 OCR local con imagen optimizada...';
        } catch (e) {
            console.warn('No se pudo preprocesar para OCR, usando original:', e);
        }
    }

    const result = await window.Tesseract.recognize(
        imageToOCR,
        'spa',
        {
            logger: m => {
                if (m.status === 'recognizing text') {
                    status.textContent = `OCR local: ${Math.round(m.progress * 100)}%`;
                }
            }
        }
    );

    const ocrText = result.data.text;
    if (!ocrText || ocrText.trim().length < 20) {
        throw new Error('El OCR no extrajo texto suficiente de la imagen.');
    }

    status.textContent = 'Enviando texto OCR a DeepSeek...';

    const response = await fetch('/api/analyze-cartola-text', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: ocrText })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonFromContent(content);

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error('La respuesta del análisis de texto no es un JSON válido.');
    }

    if (!parsed.movimientos || !Array.isArray(parsed.movimientos)) {
        throw new Error('No se encontraron movimientos en el texto OCR.');
    }

    await handleParsedMovimientos(parsed.movimientos, resultTextarea, resultSection, status, 'OCR + DeepSeek');
}

// ============================================================
// VALIDACIÓN DE SALDO
// ============================================================

function correctMovementsByTextRules(movimientos) {
    const corrected = [...movimientos];
    for (let i = 0; i < corrected.length; i++) {
        const mov = corrected[i];
        const comentario = (mov.comentario || '').toUpperCase();
        const tipo = (mov.tipo || '').toUpperCase();

        // Reglas DURAS basadas en palabras clave del Banco de Chile
        let forcedTipo = null;
        let forcedNumero = null;

        // --- ENTRADAS (ABONO) ---
        if (comentario.includes('TRASPASO DE:') || comentario.includes('TRASPASO DE ')) {
            forcedTipo = 'ABONO';
            forcedNumero = '1';
        }
        // --- SALIDAS (CARGO) ---
        else if (comentario.includes('APP-TRASPASO A:') || comentario.includes('TRASPASO A:') || comentario.includes('TRASPASO A ')) {
            forcedTipo = 'CARGO';
            forcedNumero = '2';
        }
        // CARGO SEGURO / CARGOS explícitos al inicio
        else if (comentario.startsWith('CARGO ') || comentario.startsWith('APP-CARGO ')) {
            forcedTipo = 'CARGO';
            forcedNumero = '2';
        }
        // PAGOS que son salidas
        else if (
            (comentario.includes('PAGO EN ') || comentario.includes('PAGO AUTOMATICO') || comentario.includes('PAGO TARJETA')) &&
            !comentario.includes('RECIBIDO') &&
            !comentario.includes('PROVEEDORES')
        ) {
            forcedTipo = 'CARGO';
            forcedNumero = '2';
        }
        // CHEQUES
        else if (comentario.includes('CHEQUE') || comentario.includes('CHQ')) {
            forcedTipo = 'CHEQUE';
            forcedNumero = mov.numero_mov || '0';
        }

        if (forcedTipo && forcedTipo !== tipo) {
            console.warn(`[Corrección texto] Fila ${i + 1}: "${mov.comentario}" cambiado de ${tipo} a ${forcedTipo}`);
            mov.tipo = forcedTipo;
            if (forcedNumero) mov.numero_mov = forcedNumero;
        }
    }
    return corrected;
}

function correctMovementsByBalance(movimientos) {
    if (!Array.isArray(movimientos) || movimientos.length < 1) return movimientos;

    const corrected = [...movimientos];

    for (let i = 0; i < corrected.length; i++) {
        const mov = corrected[i];
        let monto = typeof mov.monto === 'number' ? Math.round(mov.monto) : (parseInt(mov.monto) || 0);
        const saldoActual = typeof mov.saldo_despues === 'number' ? Math.round(mov.saldo_despues) : null;
        const saldoAnterior = i > 0
            ? (typeof corrected[i - 1].saldo_despues === 'number' ? Math.round(corrected[i - 1].saldo_despues) : null)
            : null;

        // Solo corregimos montos, NO tipos. El tipo ya viene determinado por la columna (100% confiable).
        if (saldoAnterior !== null && saldoActual !== null) {
            const diff = Math.abs(saldoActual - saldoAnterior);
            if (diff > 100 && (diff < monto * 0.5 || diff > monto * 1.5)) {
                console.warn(`[Corrección saldo] Fila ${i + 1}: monto ${monto} → ${diff} (por diferencia de saldos)`);
                mov.monto = diff;
            }
        }
    }

    return corrected;
}

function calculateAndValidateBalance() {
    const resultTextarea = document.getElementById('cartola-result');
    const saldoInicialInput = document.getElementById('saldo-inicial');
    const saldoFinalInput = document.getElementById('saldo-final');
    const resultDiv = document.getElementById('balance-result');

    const text = resultTextarea.value.trim();
    if (!text) {
        alert('No hay movimientos para validar.');
        return;
    }

    const saldoInicial = parseFloat(saldoInicialInput.value.replace(/\./g, '').replace(/,/g, '.')) || 0;
    const saldoFinalEsperado = parseFloat(saldoFinalInput.value.replace(/\./g, '').replace(/,/g, '.')) || 0;

    let totalAbonos = 0;
    let totalCargos = 0;
    let totalCheques = 0;
    let totalDepositos = 0;
    let lineCount = 0;

    const lines = text.split('\n');
    for (const line of lines) {
        if (!line.trim() || line.includes('Fecha') && line.includes('Comentario')) continue;
        const parts = line.split(';');
        if (parts.length < 5) continue;

        const tipo = parts[2]?.trim().toUpperCase();
        const montoStr = parts[4]?.trim().replace(/\./g, '').replace(/,/g, '.');
        const monto = parseFloat(montoStr) || 0;
        lineCount++;

        if (tipo === 'ABONO') totalAbonos += monto;
        else if (tipo === 'CARGO') totalCargos += monto;
        else if (tipo === 'CHEQUE') totalCheques += monto;
        else if (tipo === 'DEPOSITO') totalDepositos += monto;
    }

    const ingresos = totalAbonos + totalDepositos;
    const egresos = totalCargos + totalCheques;
    const saldoCalculado = saldoInicial + ingresos - egresos;
    const diferencia = saldoFinalEsperado - saldoCalculado;
    const cuadra = Math.abs(diferencia) < 1;

    const format = n => n.toLocaleString('es-CL', { maximumFractionDigits: 0 });

    resultDiv.innerHTML = `
        <div class="balance-grid">
            <div class="balance-item">
                <span class="balance-label">Movimientos:</span>
                <span class="balance-value">${lineCount}</span>
            </div>
            <div class="balance-item">
                <span class="balance-label">Saldo Inicial:</span>
                <span class="balance-value">$ ${format(saldoInicial)}</span>
            </div>
            <div class="balance-item income">
                <span class="balance-label">+ Abonos:</span>
                <span class="balance-value">$ ${format(totalAbonos)}</span>
            </div>
            <div class="balance-item income">
                <span class="balance-label">+ Depósitos:</span>
                <span class="balance-value">$ ${format(totalDepositos)}</span>
            </div>
            <div class="balance-item expense">
                <span class="balance-label">- Cargos:</span>
                <span class="balance-value">$ ${format(totalCargos)}</span>
            </div>
            <div class="balance-item expense">
                <span class="balance-label">- Cheques:</span>
                <span class="balance-value">$ ${format(totalCheques)}</span>
            </div>
            <div class="balance-item total">
                <span class="balance-label">Saldo Calculado:</span>
                <span class="balance-value">$ ${format(saldoCalculado)}</span>
            </div>
            <div class="balance-item ${cuadra ? 'success' : 'error'}">
                <span class="balance-label">Diferencia:</span>
                <span class="balance-value">$ ${format(Math.abs(diferencia))}</span>
            </div>
            <div class="balance-item ${cuadra ? 'success' : 'error'}">
                <span class="balance-label">Estado:</span>
                <span class="balance-value">${cuadra ? '✅ CUADRA' : '❌ NO CUADRA'}</span>
            </div>
        </div>
    `;
    resultDiv.classList.remove('hidden');

    // Guardar en localStorage
    saveBalanceValidation();
}

function saveBalanceValidation() {
    const saldoInicial = document.getElementById('saldo-inicial')?.value || '';
    const saldoFinal = document.getElementById('saldo-final')?.value || '';
    const resultText = document.getElementById('cartola-result')?.value || '';
    localStorage.setItem('cartola-balance', JSON.stringify({ saldoInicial, saldoFinal, resultText }));
}

function restoreBalanceValidation() {
    const saved = localStorage.getItem('cartola-balance');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.saldoInicial) document.getElementById('saldo-inicial').value = data.saldoInicial;
        if (data.saldoFinal) document.getElementById('saldo-final').value = data.saldoFinal;
        if (data.resultText) {
            const currentText = document.getElementById('cartola-result').value;
            if (currentText && currentText !== data.resultText) {
                // Si hay nuevo resultado, limpiar validación anterior
                localStorage.removeItem('cartola-balance');
                document.getElementById('saldo-inicial').value = '';
                document.getElementById('saldo-final').value = '';
                document.getElementById('balance-result').classList.add('hidden');
            }
        }
    } catch (e) {
        console.error('Error restoring balance:', e);
    }
}

function clearBalanceValidation() {
    localStorage.removeItem('cartola-balance');
    document.getElementById('saldo-inicial').value = '';
    document.getElementById('saldo-final').value = '';
    document.getElementById('balance-result').classList.add('hidden');
}