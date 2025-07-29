/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// UI Elements
const quizForm = document.getElementById('quiz-form') as HTMLFormElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const urlInput = document.getElementById('youtube-url') as HTMLInputElement;
const transcriptInput = document.getElementById('transcript-input') as HTMLTextAreaElement;
const formError = document.getElementById('form-error') as HTMLDivElement;

const outputContainer = document.getElementById('output-container') as HTMLElement;
const videoContainer = document.getElementById('video-container') as HTMLElement;
const quizContainer = document.getElementById('quiz-container') as HTMLElement;
const loader = document.getElementById('loader') as HTMLElement;
const errorMessage = document.getElementById('error-message') as HTMLElement;
const questionsList = document.getElementById('questions-list') as HTMLElement;
const resultsContainer = document.getElementById('results-container') as HTMLElement;
const resultsTitle = document.getElementById('results-title') as HTMLElement;
const resultsSummary = document.getElementById('results-summary') as HTMLElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
const retakeBtn = document.getElementById('retake-btn') as HTMLButtonElement;

// App State
let totalQuestions = 0;
let answeredQuestions = 0;
let correctAnswers = 0;
let currentTranscript: string | null = null;
let currentVideoId: string | null = null;
let previousQuestions: QuizQuestion[] = [];


interface QuizQuestion {
    question: string;
    options: string[];
    answer: string;
}

/**
 * Generates a quiz from a transcript, renders it, and handles video embedding.
 * @param transcript The transcript text.
 * @param videoId The videoId to embed the video player. Pass null to avoid re-rendering.
 * @param existingQuestions A list of questions that have already been asked to avoid repeats.
 */
async function generateQuiz(transcript: string, videoId: string | null, existingQuestions: QuizQuestion[] = []) {
    if (videoId) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        iframe.title = "YouTube video player";
        iframe.frameBorder = "0";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        videoContainer.innerHTML = '';
        videoContainer.appendChild(iframe);
    }
    
    outputContainer.classList.remove('hidden');
    clearOutput();

    try {
        let prompt = `You are an expert at creating quizzes. Based on the following video transcript, please generate 5 insightful multiple-choice questions to test comprehension of the key topics. For each question, provide 4 distinct options, with one being the correct answer. The answer must be one of the options. Ensure the questions cover different parts of the transcript.`;

        if (existingQuestions.length > 0) {
            const previousQuestionsText = existingQuestions.map(q => q.question).join('\n - ');
            prompt += `\n\nIMPORTANT: Do NOT repeat any questions from this list. Generate a completely new and different set of questions. Here are the questions that have already been asked:\n - ${previousQuestionsText}`;
        }

        prompt += `\n\nHere is the transcript: \n\n${transcript}`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            answer: { type: Type.STRING }
                        },
                        required: ['question', 'options', 'answer']
                    }
                }
            }
        });
        
        const quizData: QuizQuestion[] = JSON.parse(response.text);
        previousQuestions.push(...quizData);
        renderQuestions(quizData);

    } catch (error) {
        console.error(error);
        const errMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
        displayError(`Failed to generate quiz. ${errMessage}`);
    }
}

// Main submission flow
quizForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    const url = urlInput.value.trim();
    const transcript = transcriptInput.value.trim();
    const videoId = getYouTubeID(url);

    if (!videoId) {
        formError.textContent = 'Please enter a valid YouTube video URL.';
        formError.classList.remove('hidden');
        return;
    }

    if (!transcript || transcript.length < 100) {
        formError.textContent = 'Please paste the transcript. It must be at least 100 characters long.';
        formError.classList.remove('hidden');
        return;
    }
    
    setLoading(true);
    clearOutput();
    videoContainer.innerHTML = '';

    previousQuestions = []; // Reset for new video
    await generateQuiz(transcript, videoId);
    currentTranscript = transcript;
    currentVideoId = videoId;
    
    setLoading(false);
});


restartBtn.addEventListener('click', () => {
    outputContainer.classList.add('hidden');
    videoContainer.innerHTML = '';
    clearOutput();
    urlInput.value = '';
    transcriptInput.value = '';
    currentTranscript = null;
    currentVideoId = null;
    previousQuestions = [];
    urlInput.focus();
    formError.classList.add('hidden');
});

retakeBtn.addEventListener('click', async () => {
    if (currentTranscript && currentVideoId) {
        // Manage loading state for retake
        retakeBtn.disabled = true;
        restartBtn.disabled = true;
        retakeBtn.textContent = 'Generating...';
        loader.style.display = 'block';
        
        // Pass previous questions to generate a new set
        await generateQuiz(currentTranscript, null, previousQuestions); 
        
        // Hide loader and re-enable buttons
        loader.style.display = 'none';
        retakeBtn.disabled = false;
        restartBtn.disabled = false;
        retakeBtn.textContent = 'Generate New Questions';
    }
});


function setLoading(isLoading: boolean) {
    if (isLoading) {
        loader.style.display = 'block';
        quizContainer.insertBefore(loader, quizContainer.firstChild);
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
    } else {
        loader.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Quiz';
    }
}

function clearOutput() {
    errorMessage.classList.add('hidden');
    questionsList.innerHTML = '';
    resultsContainer.style.display = 'none';
}

function displayError(message: string) {
    clearOutput();
    videoContainer.innerHTML = '';
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function getYouTubeID(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function renderQuestions(questions: QuizQuestion[]) {
    if (!questions || questions.length === 0) {
        displayError('No questions were generated. The transcript might be too short or unclear.');
        return;
    }

    totalQuestions = questions.length;
    answeredQuestions = 0;
    correctAnswers = 0;

    questions.forEach((q, index) => {
        const questionItem = document.createElement('div');
        questionItem.className = 'question-item';

        const questionTitle = document.createElement('h3');
        questionTitle.textContent = `${index + 1}. ${q.question}`;
        questionItem.appendChild(questionTitle);
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'options';
        
        const questionName = `question-${index}`;
        const optionElements: HTMLLabelElement[] = [];

        q.options.forEach(optionText => {
            const optionLabel = document.createElement('label');
            optionLabel.className = 'option';

            const radioInput = document.createElement('input');
            radioInput.type = 'radio';
            radioInput.name = questionName;
            radioInput.value = optionText;
            
            const optionSpan = document.createElement('span');
            optionSpan.textContent = optionText;

            optionLabel.appendChild(radioInput);
            optionLabel.appendChild(optionSpan);
            optionsContainer.appendChild(optionLabel);
            optionElements.push(optionLabel);

            optionLabel.addEventListener('click', () => {
                if (optionsContainer.classList.contains('answered')) return;
                
                checkAnswer(optionElements, optionLabel, optionText, q.answer);
                optionsContainer.classList.add('answered');

                answeredQuestions++;
                if (answeredQuestions === totalQuestions) {
                    displayResults();
                }
            });
        });

        questionItem.appendChild(optionsContainer);
        questionsList.appendChild(questionItem);
    });
}

function checkAnswer(allOptionElements: HTMLLabelElement[], selectedLabel: HTMLLabelElement, selectedAnswer: string, correctAnswer: string) {
    allOptionElements.forEach(opt => opt.classList.remove('selected'));
    selectedLabel.classList.add('selected');

    if (selectedAnswer === correctAnswer) {
        selectedLabel.classList.add('correct');
        correctAnswers++;
    } else {
        selectedLabel.classList.add('incorrect');
        const correctOptionEl = allOptionElements.find(opt => {
            const input = opt.querySelector('input');
            return input && input.value === correctAnswer;
        });
        if (correctOptionEl) {
            correctOptionEl.classList.add('correct');
        }
    }

    allOptionElements.forEach(opt => {
        const input = opt.querySelector('input') as HTMLInputElement;
        if(input) {
            input.disabled = true;
            opt.style.cursor = 'default';
        }
    });
}

function displayResults() {
    let title = '';
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);

    if (percentage === 100) {
        title = 'Perfect Score! 🥳';
    } else if (percentage >= 75) {
        title = 'Great Job! 👍';
    } else if (percentage >= 50) {
        title = 'Not Bad! 😊';
    } else {
        title = 'Better Luck Next Time! 😅';
    }

    resultsTitle.textContent = title;
    resultsSummary.textContent = `You answered ${correctAnswers} out of ${totalQuestions} questions correctly (${percentage}%).`;
    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
}