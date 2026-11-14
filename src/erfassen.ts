import { mount } from 'svelte'
import './app.css'
import Erfassen from './Erfassen.svelte'

export default mount(Erfassen, { target: document.getElementById('app')! })
